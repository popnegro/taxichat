export async function loadConfig() {
  try {
    // Resolvemos la ruta al JSON global relativa a este script
    const configUrl = new URL('../config.json', import.meta.url);
    const res = await fetch(configUrl);
    
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const cfg = await res.json();

    // Leemos posibles sobrescrituras desde el HTML (body data attributes)
    const ds = document.body.dataset;

    return {
      // Prioridad: Atributo HTML > config.json global > Fallback hardcoded
      mapsKey: ds.mapsKey || cfg.mapsKey || null,
      whatsapp: ds.whatsapp || cfg.whatsappNumber || "5492613871088",
      rates: {
        base: ds.rateBase ? Number(ds.rateBase) : (cfg.rates?.base || 500),
        perKm: ds.ratePerKm ? Number(ds.ratePerKm) : (cfg.rates?.perKm || 300)
      }
    };

  } catch (err) {
    console.warn("Configuration could not be loaded, using defaults:", err);
    return {
      mapsKey: null,
      whatsapp: "5492613871088",
      rates: { base: 500, perKm: 300 }
    };
  }
}