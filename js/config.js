export async function loadConfig() {
  try {
    // Using a relative path for the local config file
    const res = await fetch('./config.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const cfg = await res.json();

    return {
      mapsKey: cfg.mapsKey || null,
      whatsapp: cfg.whatsappNumber || "5492613871088",
      rates: cfg.rates || { base: 500, perKm: 300 }
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