const mongoose = require('mongoose');

const ViajeSchema = new mongoose.Schema({
    empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa' },
    usuario: String,
    destino: String,
    socketIdCliente: String,
    chofer: { type: String, default: "Pendiente" },
    estado: { type: String, default: "buscando" },
    fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Viaje', ViajeSchema);