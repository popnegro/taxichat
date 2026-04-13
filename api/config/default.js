// api/config/default.js
export default function handler(req, res) {
  try {
    const config = {
      googleMapsKey: process.env.GOOGLE_MAPS_KEY,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      env: process.env.NODE_ENV || 'production'
    };

    // Validación de seguridad: si faltan llaves, avisar en el log de Vercel
    if (!config.googleMapsKey || !config.googleClientId) {
      console.error("CRÍTICO: Faltan variables GOOGLE_MAPS_KEY o GOOGLE_CLIENT_ID");
      return res.status(500).json({ error: "Configuración incompleta en el servidor" });
    }

    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
  }
}