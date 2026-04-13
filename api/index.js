const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

// Modelos (Definidos aquí mismo para evitar errores de ruta en Vercel)
const EmpresaSchema = new mongoose.Schema({
    nombre: String,
    slug: String,
    config: { color: String, mpToken: String }
});
const Empresa = mongoose.models.Empresa || mongoose.model('Empresa', EmpresaSchema);

const ViajeSchema = new mongoose.Schema({
    origin: String,
    destination: String,
    price: Number,
    empresaSlug: String,
    estado: { type: String, default: 'pendiente' },
    fecha: { type: Date, default: Date.now }
});
const Viaje = mongoose.models.Viaje || mongoose.model('Viaje', ViajeSchema);

const app = express();
app.use(express.json());
app.use(cors());

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
    res.json(empresa);
});

// 2. Nuevo Pedido (Dispara Realtime)
app.post('/api/nuevo-pedido', async (req, res) => {
    try {
        await connectDB();
        const nuevoViaje = new Viaje(req.body);
        await nuevoViaje.save();

        // NOTIFICAR AL PANEL vía Supabase Broadcast
        await supabase.channel(`admin-${req.body.empresaSlug}`).send({
            type: 'broadcast',
            event: 'nuevo-pedido',
            payload: nuevoViaje
        });

        res.json({ success: true, viajeId: nuevoViaje._id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export para Vercel
module.exports = app;