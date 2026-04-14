const mongoose = require('mongoose');

const EmpresaSchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: true 
    },
    slug: { 
        type: String, 
        required: true, 
        unique: true 
    },
    config: {
        color: { type: String, default: '#2563eb' },
        logo: { type: String },
        mpToken: { type: String, default: '' },
        seo: {
            title: { type: String },
            description: { type: String },
            keywords: { type: String },
            ratingValue: { type: Number, default: 4.8 },
            reviewCount: { type: Number, default: 120 },
            priceRange: { type: String, default: '$' },
            areaServed: { type: String, default: 'Mendoza, Argentina' }
        }
    },
    fechaRegistro: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.models.Empresa || mongoose.model('Empresa', EmpresaSchema);