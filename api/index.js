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
const multer = require('multer');
const XLSX = require('xlsx');
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
        const allowedPattern = /\.taxichat-beige\.vercel\.app$/;
        if (!origin || allowedPattern.test(origin) || origin === 'http://localhost:3000') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};
app.use(cors(corsOptions));

// Configuración de Multer (Almacenamiento en memoria para Vercel)
const upload = multer({ storage: multer.memoryStorage() });

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


// --- GESTIÓN DE EMPRESAS (SuperAdmin) ---
adminRouter.get('/empresas', async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: "No autorizado" });
    try {
        await connectDB();
        const empresas = await Empresa.find({});
        res.json(empresas);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

adminRouter.put('/empresa/:id', async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: "No autorizado" });
    try {
        await connectDB();
        const updated = await Empresa.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, empresa: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GENERACIÓN DE PLANTILLAS (Download Template) ---
adminRouter.get('/template/:entity', async (req, res) => {
    const { entity } = req.params;
    
    if (entity !== 'choferes') {
        return res.status(400).json({ error: "Entidad no soportada" });
    }

    // Definir las columnas de la plantilla
    const data = [
        ["Nombre", "Telefono", "Licencia", "Vehiculo"]
    ];

    // Crear el libro y la hoja en memoria
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="plantilla_${entity}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// --- CARGA MASIVA (Bulk Import) ---
adminRouter.post('/bulk-import/:entity', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se subió ningún archivo" });

    try {
        await connectDB();
        
        // 1. Leer el archivo desde el buffer
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (data.length === 0) throw new Error("El archivo está vacío");

        let result = { success: 0, errors: [] };

        // 2. Procesar según la entidad (Ej: Choferes)
        if (req.params.entity === 'choferes') {
            const { empresaId } = req.query; // Pasamos el ID de la empresa por query
            if (!empresaId) throw new Error("ID de empresa requerido");

            const preparedData = data.map((row, index) => {
                // Mapeo de columnas de Excel/CSV a campos de DB
                if (!row.Nombre || !row.Telefono) {
                    result.errors.push(`Fila ${index + 1}: Faltan campos obligatorios (Nombre/Telefono)`);
                    return null;
                }
                return {
                    nombre: row.Nombre,
                    telefono: row.Telefono,
                    licencia: row.Licencia || '',
                    vehiculo: row.Vehiculo || '',
                    empresaId
                };
            }).filter(d => d !== null);

            if (preparedData.length > 0) {
                const inserted = await Chofer.insertMany(preparedData, { ordered: false });
                result.success = inserted.length;
            }
        }

        res.json({ message: "Importación finalizada", ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- CALIFICACIÓN DE VIAJES Y ACTUALIZACIÓN DE SEO ---
app.post('/api/viaje/calificar', async (req, res) => {
    const { viajeId, calificacion } = req.body;

    if (!viajeId || calificacion < 1 || calificacion > 5) {
        return res.status(400).json({ error: "Datos de calificación inválidos" });
    }

    try {
        await connectDB();
        const viaje = await Viaje.findById(viajeId);

        if (!viaje || viaje.calificado) {
            return res.status(400).json({ error: "El viaje ya fue calificado o no existe" });
        }

        const empresa = await Empresa.findById(viaje.empresaId);
        if (!empresa) return res.status(404).json({ error: "Empresa no encontrada" });

        // Lógica de promedio ponderado
        const currentRating = empresa.config.seo.ratingValue || 0;
        const currentCount = empresa.config.seo.reviewCount || 0;

        const newCount = currentCount + 1;
        const newRating = ((currentRating * currentCount) + calificacion) / newCount;

        // Actualización atómica de la empresa
        empresa.config.seo.ratingValue = Number(newRating.toFixed(1));
        empresa.config.seo.reviewCount = newCount;
        await empresa.save();

        // Marcar viaje como calificado
        viaje.calificacion = calificacion;
        viaje.calificado = true;
        await viaje.save();

        res.json({ success: true, newRating: empresa.config.seo.ratingValue });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- GENERACIÓN DE SITEMAP XML DINÁMICO ---
app.get('/sitemap.xml', async (req, res) => {
    try {
        await connectDB();
        const empresas = await Empresa.find({}, 'slug fechaRegistro');
        const baseUrl = process.env.BASE_URL || 'https://taxichat-beige.vercel.app';

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/</loc>
        <priority>1.0</priority>
        <changefreq>daily</changefreq>
    </url>`;

        // Agregar cada empresa al sitemap
        empresas.forEach(emp => {
            // Lógica para subdominios (ej: https://mendoza.taxichat.com)
            // Si prefieres rutas, usa: const url = `${baseUrl}/reserva?slug=${emp.slug}`;
            const url = baseUrl.replace('://', `://${emp.slug}.`);
            const lastMod = emp.fechaRegistro ? emp.fechaRegistro.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            xml += `
    <url>
        <loc>${url}</loc>
        <lastmod>${lastMod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
        });

        xml += `\n</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (err) {
        res.status(500).end();
    }
});

// --- MOTOR DE RENDERIZADO SEO DINÁMICO ---
app.get(['/', '/reserva', '/client'], async (req, res) => {
    await connectDB();
    
    // Detectar slug por query o subdominio
    const host = req.headers.host || '';
    let slug = req.query.slug || 'default';
    if (host.includes('.') && !host.includes('vercel.app') && !host.includes('localhost')) {
        slug = host.split('.')[0];
    }

    const empresa = await Empresa.findOne({ slug }) || await Empresa.findOne({ slug: 'default' });
    
    // Determinar qué archivo HTML cargar (normalizando rutas)
    const isBooking = req.path === '/' || req.path.startsWith('/reserva');
    const page = isBooking ? 'reserva.html' : 'client.html';
    const filePath = path.join(__dirname, '../public', page);
    
    try {
        let html = fs.readFileSync(filePath, 'utf8');

        // Inyección de Meta Tags dinámicos
        const seoTitle = empresa.config.seo?.title || `Viaja con ${empresa.nombre}`;
        const seoDesc = empresa.config.seo?.description || `Pide tu taxi en ${empresa.nombre} de forma rápida y segura.`;
        const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const currentHost = req.headers.host;
        const currentUrl = `${protocol}://${currentHost}`;

        // Generación de JSON-LD estructurado con Breadcrumbs (@graph)
        const jsonLD = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": ["Organization", "LocalBusiness"],
                    "@id": `${currentUrl}/#organization`,
                    "name": empresa.nombre,
                    "url": empresa.config.seo?.url || currentUrl,
                    "telephone": empresa.config.seo?.telephone || "",
                    "logo": {
                        "@type": "ImageObject",
                        "url": empresa.config.logo || `${baseUrl}/assets/brand-dark.svg`
                    },
                    "image": empresa.config.logo || `${baseUrl}/assets/brand-dark.svg`,
                    "priceRange": empresa.config.seo?.priceRange || "$",
                    "address": {
                        "@type": "PostalAddress",
                        "streetAddress": empresa.config.seo?.address?.streetAddress || "",
                        "addressLocality": empresa.config.seo?.address?.addressLocality || empresa.config.seo?.areaServed || "Mendoza",
                        "addressRegion": empresa.config.seo?.address?.addressRegion || "MZ",
                        "postalCode": empresa.config.seo?.address?.postalCode || "",
                        "addressCountry": "AR"
                    }
                },
                {
                    "@type": "TaxiService",
                    "name": empresa.nombre,
                    "description": seoDesc,
                    "provider": { "@id": `${currentUrl}/#organization` },
                    "areaServed": empresa.config.seo?.areaServed || "Mendoza, Argentina",
                    "offers": {
                        "@type": "Offer",
                        "priceCurrency": "ARS",
                        "description": "Servicio de transporte con tarifa estimada"
                    },
                    "aggregateRating": {
                        "@type": "AggregateRating",
                        "ratingValue": empresa.config.seo?.ratingValue || 4.8,
                        "reviewCount": empresa.config.seo?.reviewCount || 120
                    }
                },
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {
                            "@type": "ListItem",
                            "position": 1,
                            "name": "Inicio",
                            "item": currentUrl
                        }
                    ]
                }
            ]
        };

        // Añadir segundo nivel si no estamos en la raíz
        if (req.path !== '/' && req.path !== '') {
            jsonLD["@graph"][1].itemListElement.push({
                "@type": "ListItem",
                "position": 2,
                "name": isBooking ? "Reserva" : "Pedir Viaje",
                "item": `${currentUrl}${req.path}`
            });
        }

        const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLD)}</script>`;

        // Uso de funciones de retorno para evitar errores con caracteres especiales en el JSON
        html = html.replace(/{{SEO_TITLE}}/g, () => seoTitle);
        html = html.replace(/{{SEO_DESCRIPTION}}/g, () => seoDesc);
        html = html.replace(/{{BRAND_COLOR}}/g, () => empresa.config.color);
        html = html.replace(/{{CANONICAL_URL}}/g, () => `https://${host}${req.path}`);
        html = html.replace(/{{JSON_LD}}/g, () => jsonLdScript);* // Comentado para evitar problemas de encoding, se inyectará al final

        res.send(html);
    } catch (err) {
        console.error("Error al renderizar HTML dinámico:", err);
        res.sendFile(filePath); // Fallback al archivo estático
    }
});

// Servir archivos estáticos después de las rutas dinámicas
app.use(express.static(path.join(__dirname, '../public')));


// 1. Obtener Configuración (Marca Blanca)
app.get('/api/config/:slug', async (req, res) => {
    try {
        await connectDB();
        let empresa = await Empresa.findOne({ slug: req.params.slug });
        
        if (!empresa) {
            empresa = await Empresa.findOne({ slug: 'default' });
        }

        if (!empresa) {
            return res.status(404).json({ error: "Configuración de empresa no encontrada en la base de datos." });
        }
        
        const response = {
            ...empresa.toObject(),
            publicKeys: {
                googleMaps: process.env.GOOGLE_MAPS_KEY,
                supabaseUrl: process.env.SUPABASE_URL,
                supabaseAnonKey: process.env.SUPABASE_ANON_KEY
            }
        };
        res.json(response);
    } catch (error) {
        console.error("Error en /api/config:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
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