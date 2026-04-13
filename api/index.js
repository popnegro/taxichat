require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Importación de Modelos
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();

// --- MIDDLEWARES ---
app.use(express.json());
app.use(cors());

// Permitir que el sitio sea insertado en iframes (Widget)
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
});

// Servir archivos estáticos (Local y Vercel)
app.use(express.static(path.join(__dirname, '../public')));

// --- CONEXIÓN MONGODB (CACHEADA) ---
let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log("✅ MongoDB Conectado");
        
        // Crear slug default si no existe
        const existe = await Empresa.findOne({ slug: 'default' });
        if (!existe) {
            await Empresa.create({
                nombre: "Servicio Base",
                slug: "default",
                config: { color: "#2563eb", mpToken: "" }
            });
        }
    } catch (err) {
        console.error("❌ Error DB:", err.message);
    }
}

// Inyectar conexión en cada request
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// --- CONFIGURACIÓN SOCKET.IO ---
const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: { origin: "*" },
    transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
    const { empresaId } = socket.handshake.query;
    if (empresaId) socket.join(empresaId);

    console.log(`🔌 Nuevo cliente en empresa: ${empresaId}`);

    socket.on('nuevo-pedido', async (data) => {
        const viaje = new Viaje({ ...data, empresaId, socketIdCliente: socket.id });
        await viaje.save();
        io.to(empresaId).emit('notificar-operador', viaje);
    });

    socket.on('confirmar-viaje', async (data) => {
        const v = await Viaje.findByIdAndUpdate(data.viajeId, { 
            chofer: data.chofer, 
            tiempoEstimado: data.tiempoEstimado, 
            estado: 'confirmado' 
        }, { new: true });
        if (v) io.to(v.socketIdCliente).emit('confirmacion-cliente', v);
    });
});

// --- RUTAS API ---

// Configuración de Marca Blanca
app.get('/api/config/:slug', async (req, res) => {
    try {
        let empresa = await Empresa.findOne({ slug: req.params.slug });
        if (!empresa) empresa = await Empresa.findOne({ slug: 'default' });
        res.json(empresa);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// SuperAdmin: Listar empresas
app.get('/api/superadmin/empresas', async (req, res) => {
    const empresas = await Empresa.find().sort({ fechaRegistro: -1 });
    res.json(empresas);
});

// Mercado Pago: Generar Link
app.post('/api/pagos/crear-link', async (req, res) => {
    const { viajeId, monto, empresaId } = req.body;
    try {
        const empresa = await Empresa.findById(empresaId);
        if (!empresa?.config?.mpToken) return res.status(400).send("Token MP faltante");

        const client = new MercadoPagoConfig({ accessToken: empresa.config.mpToken });
        const preference = new Preference(client);
        
        const result = await preference.create({
            body: {
                items: [{ title: `Viaje Taxichat`, quantity: 1, unit_price: Number(monto), currency_id: 'ARS' }],
                back_urls: { success: `https://${req.headers.host}/pago-exitoso.html` },
                auto_return: "approved",
            }
        });

        const viaje = await Viaje.findById(viajeId);
        if (viaje) {
            io.to(viaje.socketIdCliente).emit('recibir-pago', { link: result.init_point, monto });
        }
        res.json({ link: result.init_point });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- MANEJO DE ENCENDIDO (Local vs Vercel) ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    httpServer.listen(PORT, () => {
        console.log(`🚀 Servidor local en http://localhost:${PORT}`);
    });
}

// Exportación para Vercel
module.exports = (req, res) => {
    if (!res.socket.server.io) {
        res.socket.server.io = io;
        io.attach(res.socket.server);
    }
    app(req, res);
};