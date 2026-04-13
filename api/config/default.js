export default function handler(req, res) {
  // Siempre devolvemos 200 para evitar que el frontend "explote"
  // pero incluimos un flag de si las llaves están listas
  res.status(200).json({
    googleMapsKey: process.env.GOOGLE_MAPS_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    tema: {
        color: "#FFD700" // Color por defecto siempre presente
    },
    ready: !!process.env.GOOGLE_MAPS_KEY 
  });
}