const mongoose = require('mongoose');

const ViajeSchema = new mongoose.Schema({
    // Relación con el ID de la Empresa
    empresaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Empresa', 
        required: true 
    },
    usuario: { 
        type: String, 
        required: [true, 'El nombre del pasajero es obligatorio'] 
    },
    origen: { 
        type: String, 
        default: 'No especificado' 
    },
    destino: { 
        type: String, 
        required: [true, 'El destino es obligatorio'] 
    },
    socketIdCliente: { 
        type: String, 
        required: true 
    },
    precio: {
        type: Number,
        required: true
    },
    chofer: { 
        type: String, 
        default: 'Pendiente' 
    },
    tiempoEstimado: { 
        type: String, 
        default: '' 
    },
    estado: { 
        type: String, 
        enum: ['buscando', 'confirmado', 'pagado', 'finalizado', 'cancelado'], 
        default: 'buscando' 
    },
    fecha: { 
        type: Date, 
        default: Date.now 
    }
});

// Índice para filtrar el historial por empresa rápidamente
ViajeSchema.index({ empresaId: 1, fecha: -1 });

module.exports = mongoose.models.Viaje || mongoose.model('Viaje', ViajeSchema);