require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '../public')));

// --- CONEXIÓN A MONGODB ---
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Conectado a MongoDB Atlas");
        
        // Crear slug default si no existe
        const existe = await Empresa.findOne({ slug: 'default' });
        if (!existe) {
            await Empresa.create({
                nombre: "Servicio Base",
                slug: "default",
                config: { color: "#2563eb", mpToken: "" }
            });
            console.log("⭐ Empresa 'default' creada");
        }
    } catch (err) {
        console.error("❌ Error de conexión:", err.message);
    }
};
connectDB();

const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/api/socket',
    cors: { origin: "*" }
});

// --- API ROUTES ---
app.get('/api/config/:slug', async (req, res) => {
    try {
        let empresa = await Empresa.findOne({ slug: req.params.slug });
        if (!empresa) {
            empresa = await Empresa.findOne({ slug: 'default' });
        }
        if (!empresa) return res.status(404).json({ error: "No hay empresa configurada" });
        
        res.json(empresa);
    } catch (error) {
        // Esto evita el error del token 'A' al enviar JSON en vez de texto plano
        res.status(500).json({ error: "Error interno", details: error.message });
    }
});

// --- SOCKETS ---
io.on('connection', (socket) => {
    const { empresaId } = socket.handshake.query;
    if (empresaId) socket.join(empresaId);
    
    socket.on('nuevo-pedido', async (data) => {
        const viaje = new Viaje({ ...data, empresaId, socketIdCliente: socket.id });
        await viaje.save();
        io.to(empresaId).emit('notificar-operador', viaje);
    });
});

// --- ENCENDIDO LOCAL ---
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 SERVIDOR ACTIVO EN http://localhost:${PORT}`);
    console.log(`📡 PRUEBA API: http://localhost:${PORT}/api/config/default\n`);
});

module.exports = app;