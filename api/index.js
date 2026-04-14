const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const Joi = require('joi'); // Importar Joi
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIGURACIÓN DE RATE LIMITING ---

// Limite general para todas las peticiones de la API (100 peticiones cada 15 min)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Por favor, intenta de nuevo en 15 minutos." }
});

// Limite estricto para creación de pedidos (5 pedidos por hora por IP)
const pedidoLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: { error: "Límite de pedidos alcanzado. Por favor, contacta a soporte si crees que es un error." }
});

app.use('/api/', generalLimiter);

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Conexión MongoDB (Serverless Ready)
const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    await mongoose.connect(process.env.MONGO_URI);
};

// --- RUTAS API ---

// 1. Obtener Configuración (Marca Blanca)
app.get('/api/config/:slug', async (req, res) => {
    await connectDB();
    let empresa = await Empresa.findOne({ slug: req.params.slug }) || await Empresa.findOne({ slug: 'default' });
    
    // Combinamos datos de la DB con variables de entorno públicas
    const response = {
        ...empresa.toObject(),
        publicKeys: {
            googleMaps: process.env.GOOGLE_MAPS_KEY,
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY // Asegúrate de añadir esta al .env
        }
    };
    res.json(response);
});

// Esquema de validación Joi para un nuevo pedido
const nuevoPedidoSchema = Joi.object({
    usuario: Joi.string().min(3).max(50).required().messages({
        'string.min': 'El nombre de usuario debe tener al menos 3 caracteres.',
        'string.max': 'El nombre de usuario no debe exceder los 50 caracteres.',
        'any.required': 'El nombre de usuario es obligatorio.'
    }),
    origen: Joi.string().min(5).required().messages({ 'any.required': 'El origen es obligatorio.' }),
    destino: Joi.string().min(5).required().messages({ 'any.required': 'El destino es obligatorio.' }),
    precio: Joi.number().min(0).required().messages({ 'any.required': 'El precio es obligatorio.', 'number.min': 'El precio no puede ser negativo.' }),
    empresaSlug: Joi.string().required().messages({ 'any.required': 'El slug de la empresa es obligatorio.' })
});

// 2. Nuevo Pedido (Dispara Realtime)
app.post('/api/nuevo-pedido', pedidoLimiter, async (req, res) => {
    try {
        // Validar el cuerpo de la petición con Joi
        const { error, value } = nuevoPedidoSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        await connectDB(); // Asegurar conexión a DB después de la validación inicial

        // Buscamos la empresa para asegurar el ID correcto
        const empresa = await Empresa.findOne({ slug: value.empresaSlug });
        if (!empresa) throw new Error("Empresa no encontrada");

        const nuevoViaje = new Viaje({
            ...value, // Usar el valor validado por Joi
            empresaId: empresa._id,
            socketIdCliente: "web-client" // Placeholder para Supabase
        });
        await nuevoViaje.save();

        const payload = { ...nuevoViaje.toObject(), empresaSlug: value.empresaSlug };

        // Notificamos a la empresa específica
        await supabase.channel(`admin-${value.empresaSlug}`).send({
            type: 'broadcast',
            event: 'nuevo-pedido',
            payload: payload
        });

        // Notificamos al SuperAdmin (Panel Global)
        await supabase.channel(`admin-global`).send({
            type: 'broadcast',
            event: 'nuevo-pedido',
            payload: payload
        });

        res.json({ success: true, viajeId: nuevoViaje._id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Confirmar Pedido (Solo Operador)
app.post('/api/confirmar-pedido', async (req, res) => {
    const { viajeId, chofer, tiempoEstimado, operadorToken } = req.body;

    // Validación simple de seguridad para el PMV
    // En producción, aquí usarías Supabase Auth o un JWT
    if (operadorToken !== process.env.OPERADOR_SECRET && operadorToken !== process.env.SUPERADMIN_SECRET) {
        return res.status(403).json({ error: "No autorizado" });
    }

    try {
        await connectDB();
        const viaje = await Viaje.findByIdAndUpdate(viajeId, { 
            chofer, 
            tiempoEstimado, 
            estado: 'confirmado' 
        }, { new: true }).populate('empresaId');

        let mpLink = null;

        // Integración real con Mercado Pago
        if (viaje.empresaId.config && viaje.empresaId.config.mpToken && viaje.precio > 0) {
            try {
                const client = new MercadoPagoConfig({ accessToken: viaje.empresaId.config.mpToken });
                const preference = new Preference(client);

                const response = await preference.create({
                    body: {
                        items: [{
                            title: `Viaje TaxiChat - ${viaje.usuario}`,
                            quantity: 1,
                            unit_price: Number(viaje.precio),
                            currency_id: 'ARS'
                        }],
                        external_reference: viaje._id.toString(),
                        notification_url: `${process.env.BASE_URL}/api/webhooks/mercadopago?slug=${viaje.empresaId.slug}`,
                        auto_return: 'approved'
                    }
                });
                mpLink = response.init_point;
            } catch (error) {
                console.error("Error al generar link de Mercado Pago:", error);
            }
        }

        // Emitir broadcast seguro desde el servidor
        await supabase.channel(`viaje-${viaje.empresaId.slug}`).send({
            type: 'broadcast',
            event: 'confirmacion-cliente',
            payload: { chofer, tiempo: tiempoEstimado, mpLink, viajeId }
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Webhook de Mercado Pago
app.post('/api/webhooks/mercadopago', async (req, res) => {
    const { type, data } = req.body;
    const { slug } = req.query;

    // Mercado Pago envía notificaciones de varios tipos, nos interesa 'payment'
    if (type === 'payment' && data.id && slug) {
        try {
            await connectDB();
            const empresa = await Empresa.findOne({ slug });
            if (!empresa) return res.sendStatus(404);

            const client = new MercadoPagoConfig({ accessToken: empresa.config.mpToken });
            const payment = new Payment(client);
            const paymentDetails = await payment.get({ id: data.id });

            if (paymentDetails.status === 'approved') {
                const viajeId = paymentDetails.external_reference;
                await Viaje.findByIdAndUpdate(viajeId, { estado: 'pagado' });

                // Notificar al cliente y al operador en tiempo real
                await supabase.channel(`viaje-${slug}`).send({
                    type: 'broadcast',
                    event: 'viaje-pagado',
                    payload: { 
                        viajeId, 
                        status: 'success',
                        paymentId: data.id,
                        monto: paymentDetails.transaction_amount
                    }
                });
            }
        } catch (error) {
            console.error("Error procesando Webhook MP:", error);
        }
    }
    // Siempre responder 200 a Mercado Pago para evitar reintentos infinitos
    res.sendStatus(200);
});

// Levantar servidor local si no es Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));
}

// Export para Vercel
module.exports = app;