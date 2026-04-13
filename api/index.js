const path = require('path');
// 1. CARGA DE VARIABLES DE ENTORNO (Prioridad Máxima)
// Intentamos cargar desde la raíz (un nivel arriba de /api)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// 2. IMPORTACIÓN DE MODELOS
// Asegúrate de que los archivos existan en /models con estos nombres exactos
const Empresa = require('../models/Empresa');
const Viaje = require('../models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());

// Permitir visualización en Iframes (para el widget)
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
});

// Servir archivos estáticos de la carpeta /public
app.use(express.static(path.join(__dirname, '../public')));

// 3. CONEXIÓN A MONGODB (Resistente a Serverless)
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    const uri = process.env.MONGO_URI;
    
    if (!uri) {
        console.error("❌ ERROR: La variable MONGO_URI no está definida.");
        console.error("👉 Revisa que el archivo .env esté en la raíz del proyecto.");
        return;
    }

    try {
        await mongoose.connect(uri);
        isConnected = true;
        console.log("✅ Conexión exitosa a MongoDB Atlas");

        // Crear slug 'default' automáticamente si la DB está vacía
        const existeDefault = await Empresa.findOne({ slug: 'default' });
        if (!existeDefault) {
            await Empresa.create({
                nombre: "Taxichat Global",
                slug: "default",
                config: { color: "#2563eb", mpToken: "" }
            });
            console.log("⭐ Registro 'default' creado en la base de datos.");
        }
    } catch (err) {
        console.error("❌ Error al conectar a MongoDB:", err.message);
    }
};

// Middleware para asegurar conexión en cada petición
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: { origin: "*" },
    transports: ['polling', 'websocket']
});

// 4. LÓGICA DE SOCKETS
io.on('connection', (socket) => {
    const { empresaId } = socket.handshake.query;
    if (empresaId) socket.join(empresaId);

    console.log(`🔌 Cliente conectado a empresa: ${empresaId || 'Sin ID'}`);

    socket.on('nuevo-pedido', async (data) => {
        try {
            const viaje = new Viaje({ ...data, empresaId, socketIdCliente: socket.id });
            await viaje.save();
            io.to(empresaId).emit('notificar-operador', viaje);
        } catch (e) {
            console.error("Error al guardar pedido:", e.message);
        }
    });

    socket.on('confirmar-viaje', async (data) => {
        const v = await Viaje.findByIdAndUpdate(data.viajeId, { 
            chofer: data.chofer, 
            estado: 'confirmado' 
        }, { new: true });
        if (v) io.to(v.socketIdCliente).emit('confirmacion-cliente', v);
    });
});

// 5. RUTAS DE LA API
app.get('/api/config/:slug', async (req, res) => {
    try {
        let empresa = await Empresa.findOne({ slug: req.params.slug });
        if (!empresa) empresa = await Empresa.findOne({ slug: 'default' });
        
        if (!empresa) return res.status(404).json({ error: "No hay configuración" });
        res.json(empresa);
    } catch (e) {
        res.status(500).json({ error: "Error en el servidor", detalle: e.message });
    }
});

app.get('/api/superadmin/empresas', async (req, res) => {
    try {
        const empresas = await Empresa.find().sort({ fechaRegistro: -1 });
        res.json(empresas);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. EXPORTACIÓN Y ENCENDIDO
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(PORT, () => {
        console.log("-----------------------------------------");
        console.log(`🚀 SERVIDOR LOCAL: http://localhost:${PORT}`);
        console.log(`📂 PÚBLICO: http://localhost:${PORT}/client.html`);
        console.log("-----------------------------------------");
    });
}

// Necesario para que Socket.io funcione en Vercel
module.exports = (req, res) => {
    if (!res.socket.server.io) {
        res.socket.server.io = io;
        io.attach(res.socket.server);
    }
    app(req, res);
};