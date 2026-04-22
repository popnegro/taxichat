export async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error();

    const cfg = await res.json();

    return {
      mapsKey: cfg.mapsKey || null,
      whatsapp: cfg.whatsappNumber || "5492613871088"
      rates: cfg.rates || { base: 500, perKm: 300 }
    };

  } catch {
    return {
      mapsKey: null,
      whatsapp: "5492613871088"
      rates: { base: 500, perKm: 300 }
    };
  }
}