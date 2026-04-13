require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Modelos
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();

// --- MIDDLEWARES (Orden Crítico) ---
app.use(express.json());
app.use(cors());

// Permitir iframes (Debe ir antes de las rutas)
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
});

// Conexión a MongoDB con Caché
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGO_URI);
    cachedDb = db;
    return db;
}

app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        res.status(500).json({ error: "Error de conexión a base de datos" });
    }
});

// --- SOCKET.IO SETUP ---
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: '/api/socket'
});

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
        if (v) io.to(v.socketIdCliente).emit('confirmacion-cliente', v);
    });
});

// --- RUTAS API ---

// Configuración de Empresa por Slug (Público)
app.get('/api/config/:slug', async (req, res) => {
    const empresa = await Empresa.findOne({ slug: req.params.slug });
    res.json(empresa);
});

// Crear Empresa (Faltaba esta ruta)
app.post('/api/empresas', async (req, res) => {
    try {
        const nueva = new Empresa(req.body);
        await nueva.save();
        res.json(nueva);
    } catch (error) {
        res.status(500).json({ error: "Error al crear empresa" });
    }
});

// SuperAdmin: Listar
app.get('/api/superadmin/empresas', async (req, res) => {
    try {
        const empresas = await Empresa.find().sort({ fechaRegistro: -1 });
        res.json(empresas);
    } catch (error) {
        res.status(500).json({ error: "Error al listar empresas" });
    }
});

// SuperAdmin: Editar
app.put('/api/superadmin/empresas/:id', async (req, res) => {
    try {
        const empresaActualizada = await Empresa.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(empresaActualizada);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar" });
    }
});

// SuperAdmin: Eliminar
app.delete('/api/superadmin/empresas/:id', async (req, res) => {
    try {
        await Empresa.findByIdAndDelete(req.params.id);
        await Viaje.deleteMany({ empresaId: req.params.id });
        res.json({ message: "Eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

// Mercado Pago: Generar Link
app.post('/api/pagos/crear-link', async (req, res) => {
    const { viajeId, monto, empresaId } = req.body;
    try {
        const empresa = await Empresa.findById(empresaId);
        if (!empresa || !empresa.config.mpToken) {
            return res.status(400).json({ error: "Mercado Pago no configurado" });
        }

        const client = new MercadoPagoConfig({ accessToken: empresa.config.mpToken });
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [{
                    title: `Viaje taxichat`,
                    quantity: 1,
                    unit_price: Number(monto),
                    currency_id: 'ARS'
                }],
                back_urls: { success: `https://${req.headers.host}/pago-exitoso.html` },
                auto_return: "approved",
            }
        });

        const viaje = await Viaje.findById(viajeId);
        if (viaje) {
            io.to(viaje.socketIdCliente).emit('recibir-pago', {
                link: result.init_point,
                monto: monto
            });
        }

        res.json({ link: result.init_point });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- EXPORT PARA VERCEL (Siempre al final) ---
module.exports = (req, res) => {
    if (!res.socket.server.io) {
        res.socket.server.io = io;
        io.attach(res.socket.server);
    }
    app(req, res);
};