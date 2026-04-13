require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
const path = require('path');
app.use(cors());

// Cabecera para permitir Iframes en otros dominios
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
});

// ✅ SERVIR ARCHIVOS ESTÁTICOS EN LOCAL
app.use(express.static(path.join(__dirname, '../public')));

// Ruta opcional para forzar que la raíz sea index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Conexión MongoDB con Seed de Slugs
let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;

    // Crear Slugs iniciales si la DB está vacía
    const slugsBase = [
        { nombre: "Taxichat Base", slug: "default", config: { color: "#2563eb", mpToken: "" } },
        { nombre: "Taxi Mendoza", slug: "mendoza", config: { color: "#10b981", mpToken: "" } }
    ];

    for (const s of slugsBase) {
        const existe = await Empresa.findOne({ slug: s.slug });
        if (!existe) await Empresa.create(s);
    }
}

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/api/socket',
    cors: { origin: "*" }
});

// --- LÓGICA DE SOCKETS ---
io.on('connection', (socket) => {
    const { empresaId } = socket.handshake.query;
    if (empresaId) socket.join(empresaId);

    socket.on('nuevo-pedido', async (data) => {
        const viaje = new Viaje({ ...data, empresaId, socketIdCliente: socket.id });
        await viaje.save();
        io.to(empresaId).emit('notificar-operador', viaje);
    });

    socket.on('confirmar-viaje', async (data) => {
        const v = await Viaje.findByIdAndUpdate(data.viajeId, { 
            chofer: data.chofer, tiempoEstimado: data.tiempoEstimado, estado: 'confirmado' 
        }, { new: true });
        if (v) io.to(v.socketIdCliente).emit('confirmacion-cliente', v);
    });
});

// --- RUTAS API ---
app.get('/api/config/:slug', async (req, res) => {
    let empresa = await Empresa.findOne({ slug: req.params.slug });
    if (!empresa) empresa = await Empresa.findOne({ slug: 'default' });
    res.json(empresa);
});

app.get('/api/superadmin/empresas', async (req, res) => {
    const empresas = await Empresa.find().sort({ fechaRegistro: -1 });
    res.json(empresas);
});

app.post('/api/pagos/crear-link', async (req, res) => {
    const { viajeId, monto, empresaId } = req.body;
    try {
        const empresa = await Empresa.findById(empresaId);
        const client = new MercadoPagoConfig({ accessToken: empresa.config.mpToken });
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: [{ title: `Viaje Taxichat`, quantity: 1, unit_price: Number(monto), currency_id: 'ARS' }],
                back_urls: { success: `https://${req.headers.host}/pago-exitoso` },
                auto_return: "approved",
            }
        });
        res.json({ link: result.init_point });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Exportación para Vercel
// --- ENCENDIDO DEL SERVIDOR (Solo para Local) ---
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(PORT, () => {
        console.log(`-----------------------------------------`);
        console.log(`🚀 SERVIDOR ENCENDIDO EN LOCAL`);
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`📂 Archivos estáticos en: /public`);
        console.log(`-----------------------------------------`);
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