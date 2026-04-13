const mongoose = require('mongoose');

const EmpresaSchema = new mongoose.Schema({
    nombre: String,
    slug: { type: String, unique: true },
    logo: String,
    config: {
        color: { type: String, default: "#009ee3" },
        mpToken: String
    }
});

module.exports = mongoose.model('Empresa', EmpresaSchema);