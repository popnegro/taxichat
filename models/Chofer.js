const mongoose = require('mongoose');

const ChoferSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    telefono: { type: String, required: true },
    licencia: { type: String },
    vehiculo: { type: String }, // Ej: "Fiat Cronos - ABC 123"
    empresaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Empresa', 
        required: true 
    },
    activo: { type: Boolean, default: true },
    fechaRegistro: { type: Date, default: Date.now }
});

// Índice para búsquedas rápidas por empresa
ChoferSchema.index({ empresaId: 1 });

module.exports = mongoose.models.Chofer || mongoose.model('Chofer', ChoferSchema);