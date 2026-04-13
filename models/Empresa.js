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
        unique: true, // Esto ya crea el índice automáticamente
        lowercase: true,
        trim: true 
    },
    logo: { type: String, default: '' },
    config: {
        color: { type: String, default: '#10b981' },
        mpToken: { type: String, default: '' }
    },
    fechaRegistro: { type: Date, default: Date.now }
});

// BORRAMOS la línea: EmpresaSchema.index({ slug: 1 }); 
// porque ya está cubierto por el "unique: true" de arriba.

module.exports = mongoose.model('Empresa', EmpresaSchema);