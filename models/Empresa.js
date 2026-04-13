const mongoose = require('mongoose');

const EmpresaSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    logo: { type: String, default: "" },
    config: {
        color: { type: String, default: "#2563eb" },
        mpToken: { type: String, default: "" }
    },
    fechaRegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Empresa || mongoose.model('Empresa', EmpresaSchema);