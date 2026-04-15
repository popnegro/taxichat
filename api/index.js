const path = require('path');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const Joi = require('joi'); // Importar Joi
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');
const Chofer = require('../models/Chofer');

const app = express();
app.use(express.json());
app.use(cookieParser());

const corsOptions = {
    origin: (origin, callback) => {
        const isLocal = !origin || origin.includes('localhost');
        const isMyDomain = origin && origin.endsWith('.vercel.app');

        if (isLocal || isMyDomain) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};
app.use(cors(corsOptions));

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

// --- AUTO-INICIALIZACIÓN (Empresa Default) ---
const seedDefaultEmpresa = async () => {
    try {
        const count = await Empresa.countDocuments({ slug: 'default' });
        if (count === 0) {
            await Empresa.create({
                nombre: "TaxiChat Default",
                slug: "default",
                config: {
                    color: "#2563eb",
                    gaId: process.env.GA_TRACKING_ID || "G-81FQCFDC6N",
                    seo: {
                        title: "TaxiChat - Tu Viaje Seguro",
                        description: "La plataforma líder en gestión de traslados white-label.",
                        areaServed: "Mendoza, Argentina",
                        ratingValue: 4.8,
                        reviewCount: 120,
                        priceRange: "$"
                    }
                }
            });
            console.log("⭐ Empresa 'default' creada automáticamente.");
        }
    } catch (e) {
        console.error("❌ Error en auto-seeding:", e.message);
    }
};

// Conexión MongoDB (Serverless Ready)
const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Evita esperas infinitas si la DB no responde
        connectTimeoutMS: 10000,
    });
    await seedDefaultEmpresa();
};

// --- RUTAS API ---

// Health Check Endpoint
app.get('/api/status', async (req, res) => {
    const status = {
        mongodb: 'disconnected',
        supabase: 'disconnected',
        mercadopago: 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    };

    try {
        // 1. Verificar MongoDB
        await connectDB();
        const dbState = mongoose.connection.readyState;
        const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
        status.mongodb = states[dbState] || 'unknown';

        // 2. Verificar Supabase (llamada ligera a la API REST)
        // Intentamos obtener la sesión o simplemente verificar conectividad
        const { data, error } = await supabase.from('_health_check').select('*').limit(1);
        // Nota: Incluso si la tabla no existe, recibir una respuesta (error 404 o similar) 
        // confirma que el cliente pudo comunicarse con el servidor de Supabase.
        if (!error || error.code !== 'PGRST301') { // PGRST301 indica error de API Key/Auth
            status.supabase = 'connected';
        }

        // 3. Verificar Mercado Pago (Cuenta Default)
        const defaultEmpresa = await Empresa.findOne({ slug: 'default' });
        if (defaultEmpresa?.config?.mpToken) {
            const mpRes = await fetch('https://api.mercadopago.com/wallet/balance', {
                headers: { 'Authorization': `Bearer ${defaultEmpresa.config.mpToken}` }
            });
            
            if (mpRes.ok) {
                const balanceData = await mpRes.json();
                status.mercadopago = {
                    status: 'connected',
                    total: balanceData.total_amount,
                    currency: balanceData.currency_id
                };
            } else {
                status.mercadopago = mpRes.status === 401 ? 'invalid_token' : 'api_error';
            }
        } else {
            status.mercadopago = 'not_configured';
        }
    } catch (err) {
        console.error('Health Check Error:', err.message);
    }

    const isHealthy = status.mongodb === 'connected' && status.supabase === 'connected';
    res.status(isHealthy ? 200 : 503).json(status);
});

// Login para Operadores y SuperAdmin
app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    let role = null;

    if (password === process.env.OPERADOR_SECRET) role = 'operador';
    if (password === process.env.SUPERADMIN_SECRET) role = 'superadmin';

    if (!role) return res.status(401).json({ error: "Credenciales inválidas" });

    // Access Token: Sigue enviándose en el body para guardarlo en memoria o localStorage (vida corta)
    const accessToken = jwt.sign({ role }, process.env.JWT_SECRET || 'secret_key_pmv', { expiresIn: '15m' });
    
    // Refresh Token: Se enviará en una cookie HttpOnly
    const refreshToken = jwt.sign({ role }, process.env.JWT_REFRESH_SECRET || 'refresh_key_pmv', { expiresIn: '7d' });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true, // Protege contra XSS
        secure: process.env.NODE_ENV === 'production', // Solo sobre HTTPS en producción
        sameSite: 'Lax', // Permite compartir entre subdominios con seguridad y CSRF básico
        domain: process.env.NODE_ENV === 'production' ? '.taxichat-beige.vercel.app' : 'localhost',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
    });

    res.json({ success: true, accessToken });
});

// Endpoint para refrescar el Access Token
app.post('/api/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: "Refresh Token requerido" });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_key_pmv');
        const newAccessToken = jwt.sign({ role: decoded.role }, process.env.JWT_SECRET || 'secret_key_pmv', { expiresIn: '15m' });
        res.json({ success: true, accessToken: newAccessToken });
    } catch (err) {
        res.status(403).json({ error: "Refresh Token inválido o expirado" });
    }
});

// Logout para limpiar la cookie
app.post('/api/logout', (req, res) => {
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'Strict' });
    res.json({ success: true });
});


// --- MIDDLEWARE DE AUTENTICACIÓN ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

    if (!token) return res.status(403).json({ error: "Acceso denegado: Token faltante" });

    jwt.verify(token, process.env.JWT_SECRET || 'secret_key_pmv', (err, user) => {
        if (err) return res.status(401).json({ error: "Sesión inválida o expirada" });
        req.user = user; // Guardamos el rol (operador/superadmin) para uso posterior
        next();
    });
};

// --- ROUTER ADMINISTRATIVO (Protección Automática) ---
const adminRouter = express.Router();
adminRouter.use(authenticateToken); // Todas las rutas en este router requieren JWT

// Registramos el router en la app con un prefijo
app.use('/api/admin', adminRouter);


// --- MOTOR DE RENDERIZADO SEO DINÁMICO (Catch-all para Pages) ---
app.get(['/', '/reserva*', '/client*', '/:slug'], async (req, res, next) => {
    // Omitir si es una llamada a la API o un recurso con extensión (.js, .css, etc)
    if (req.path.startsWith('/api') || req.path.includes('.')) return next();

    const isClient = req.path.startsWith('/client');
    const page = isClient ? 'client.html' : 'reserva.html';
    const filePath = path.join(__dirname, '../public', page);

    try {
        let html = fs.readFileSync(filePath, 'utf8');
        
        // Inyección de variables de entorno (Independientes de la DB)
        const googleMapsKey = process.env.GOOGLE_MAPS_KEY || '';
        const mapsParams = `${googleMapsKey}&libraries=places&callback=initMap`;
        html = html.replace(/{{GOOGLE_MAPS_KEY}}/g, () => mapsParams);
        html = html.replace(/{{GOOGLE_CLIENT_ID}}/g, () => process.env.GOOGLE_CLIENT_ID || '');

        // Intentar conectar a la DB para datos de marca
        await connectDB();
        
        const host = req.headers.host || '';
        let slug = req.query.slug || req.params.slug || 'default';
        if (host.includes('.') && !host.includes('vercel.app') && !host.includes('localhost')) {
            slug = host.split('.')[0];
        }

        const empresa = await Empresa.findOne({ slug }) || await Empresa.findOne({ slug: 'default' });
        const seoTitle = empresa.config.seo?.title || `Viaja con ${empresa.nombre}`;
        const seoDesc = empresa.config.seo?.description || `Pide tu taxi en ${empresa.nombre} de forma rápida y segura.`;
        const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
        const currentUrl = `https://${host}${req.path}`;

        const jsonLD = {
            "@context": "https://schema.org",
            "@type": "TaxiService",
            "name": empresa.nombre,
            "description": seoDesc,
            "provider": { "@type": "LocalBusiness", "name": empresa.nombre, "image": empresa.config.logo || `${baseUrl}/assets/brand-dark.svg` }
        };
        const jsonLdScript = JSON.stringify(jsonLD);

        html = html.replace(/{{SEO_TITLE}}/g, () => seoTitle);
        html = html.replace(/{{SEO_DESCRIPTION}}/g, () => seoDesc);
        html = html.replace(/{{BRAND_COLOR}}/g, () => empresa.config.color || '#000000');
        html = html.replace(/{{CANONICAL_URL}}/g, () => currentUrl);
        html = html.replace(/{{JSON_LD}}/g, () => jsonLdScript);
        html = html.replace(/{{GA_ID}}/g, () => empresa.config.gaId || process.env.GA_TRACKING_ID || 'G-81FQCFDC6N');

        res.send(html);
    } catch (err) {
        console.error("Render Error:", err.message);
        // Fallback: enviar el archivo pero intentar limpiar placeholders básicos para evitar crashes en el cliente
        let fallbackHtml = fs.readFileSync(filePath, 'utf8');
        fallbackHtml = fallbackHtml.replace(/{{GOOGLE_MAPS_KEY}}/g, () => process.env.GOOGLE_MAPS_KEY || '');
        res.send(fallbackHtml);
    }
});

// Servir archivos estáticos después de las rutas dinámicas
app.use(express.static(path.join(__dirname, '../public')));

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
                supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
                googleClientId: process.env.GOOGLE_CLIENT_ID
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
        console.log("🚀 Despachando evento Realtime para:", value.empresaSlug);

        // Notificamos usando Promise.all para no bloquear y manejar errores individualmente
        const channels = [`admin-${value.empresaSlug}`, `admin-global`];
        await Promise.all(channels.map(async (channelName) => {
            try {
                await supabase.channel(channelName).send({
                    type: 'broadcast',
                    event: 'nuevo-pedido',
                    payload: payload
                });
            } catch (sendError) {
                console.error(`❌ Error enviando a canal ${channelName}:`, sendError.message);
            }
        }));

        res.json({ success: true, viajeId: nuevoViaje._id });
    } catch (e) {
        console.error("❌ Error en /api/nuevo-pedido:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// 3. Confirmar Pedido (Ahora dentro del router protegido)
adminRouter.post('/confirmar-pedido', async (req, res) => {
    const { viajeId, chofer, tiempoEstimado } = req.body;

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