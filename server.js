require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Modelos
const Empresa = require('./models/Empresa');
const Viaje = require('./models/Viaje');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Conectado"));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// --- API ENDPOINTS ---

// Crear empresa (SuperAdmin)
app.post('/api/empresas', async (req, res) => {
    const nueva = new Empresa(req.body);
    await nueva.save();
    res.json(nueva);
});

// Obtener config por slug (Marca Blanca)
app.get('/api/config/:slug', async (req, res) => {
    const empresa = await Empresa.findOne({ slug: req.params.slug });
    res.json(empresa);
});

// Historial filtrado por empresa
app.get('/api/historial/:empresaId', async (req, res) => {
    const viajes = await Viaje.find({ empresaId: req.params.empresaId }).sort({ fecha: -1 });
    res.json(viajes);
});

// --- SOCKET LOGIC (Multitenancy) ---
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

httpServer.listen(process.env.PORT, () => console.log("Servidor SaaS listo"));