require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// IMPORTANTE: Verifica que estas rutas sean correctas
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());

// Servir estáticos (Para que localhost:3000/client.html funcione)
app.use(express.static(path.join(__dirname, '../public')));

// Conexión a MongoDB con log de errores
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado con éxito"))
    .catch(err => console.error("❌ Error al conectar MongoDB:", err));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/api/socket',
    cors: { origin: "*" }
});

// --- RUTA CON ERROR 500 CONTROLADO ---
app.get('/api/config/:slug', async (req, res) => {
    try {
        console.log(`🔍 Buscando configuración para: ${req.params.slug}`);
        let empresa = await Empresa.findOne({ slug: req.params.slug });
        
        if (!empresa) {
            console.log("⚠️ Slug no encontrado, intentando con 'default'");
            empresa = await Empresa.findOne({ slug: 'default' });
        }

        if (!empresa) {
            return res.status(404).json({ error: "No existe la empresa default en la DB" });
        }

        res.json(empresa);
    } catch (error) {
        console.error("💥 ERROR CRÍTICO EN API:", error.message);
        res.status(500).send("Error interno del servidor: " + error.message);
    }
});

// --- EXPORT Y ENCENDIDO ---
const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 SERVIDOR CORRIENDO EN http://localhost:${PORT}`);
});

module.exports = app;