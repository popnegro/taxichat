const mongoose = require('mongoose');

const EmpresaSchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: [true, 'El nombre de la empresa es obligatorio'],
        trim: true 
    },
    slug: { 
        type: String, 
        required: [true, 'El slug (URL) es obligatorio'], 
        unique: true, 
        lowercase: true,
        trim: true 
    },
    logo: { 
        type: String, 
        default: '' 
    },
    config: {
        color: { 
            type: String, 
            default: '#10b981' // Verde esmeralda por defecto
        },
        mpToken: { 
            type: String, 
            default: '' 
        }
    },
    fechaRegistro: { 
        type: Date, 
        default: Date.now 
    }
});

// Índice para búsquedas rápidas por slug
EmpresaSchema.index({ slug: 1 });

module.exports = mongoose.model('Empresa', EmpresaSchema);