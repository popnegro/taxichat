require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Modelos
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión a MongoDB (con caché para evitar múltiples conexiones en serverless)
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGO_URI);
    cachedDb = db;
    return db;
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: '/api/socket' // Ruta específica para los sockets en Vercel
});

// Middlewares
app.use(async (req, res, next) => {
    await connectToDatabase();
    next();
});

// API Routes
app.get('/api/config/:slug', async (req, res) => {
    const empresa = await Empresa.findOne({ slug: req.params.slug });
    res.json(empresa);
});

// Sockets
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
            chofer: data.chofer, estado: 'confirmado' 
        }, { new: true });
        io.to(v.socketIdCliente).emit('confirmacion-cliente', v);
    });
});

// Exportar para Vercel
module.exports = (req, res) => {
    if (!res.socket.server.io) {
        res.socket.server.io = io;
        io.attach(res.socket.server);
    }
    app(req, res);
};

// 1. Listar todas las empresas (Para el SuperAdmin)
app.get('/api/superadmin/empresas', async (req, res) => {
    try {
        const empresas = await Empresa.find().sort({ fechaRegistro: -1 });
        res.json(empresas);
    } catch (error) {
        res.status(500).json({ error: "Error al listar empresas" });
    }
});

// 2. Editar una empresa existente
app.put('/api/superadmin/empresas/:id', async (req, res) => {
    try {
        const empresaActualizada = await Empresa.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json(empresaActualizada);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar la empresa" });
    }
});

// 3. Eliminar una empresa y sus viajes asociados
app.delete('/api/superadmin/empresas/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await Empresa.findByIdAndDelete(id);
        await Viaje.deleteMany({ empresaId: id }); // Limpieza de datos
        res.json({ message: "Empresa y datos eliminados correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});