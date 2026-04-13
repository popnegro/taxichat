export default function handler(req, res) {
  try {
    const config = {
      googleMapsKey: process.env.GOOGLE_MAPS_KEY || '',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      tema: {
        color: "#FFD700" // Amarillo Taxi por defecto
      },
      env: process.env.NODE_ENV || 'production'
    };

    if (!config.googleMapsKey || !config.googleClientId) {
      console.warn("⚠️ Advertencia: Faltan variables de entorno en Vercel.");
    }

    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor de configuración" });
  }
}