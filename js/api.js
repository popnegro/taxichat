export async function saveLead(data) {
  try {
    // Resolvemos la ruta relativa al script. 
    // '../api/lead' asume que la API está en la raíz, al mismo nivel que config.json
    const apiUrl = new URL('../api/lead', import.meta.url);
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("Nota: El lead no se guardó en el servidor (", e.message, "). Esto es normal si usas un servidor estático como Live Server. Necesitarás un backend para procesar el POST /api/lead.");
  }
}