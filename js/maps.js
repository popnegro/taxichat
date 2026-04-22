export async function loadMaps(apiKey) {
  if (!apiKey) return null;
  // Evita cargar el script múltiples veces si ya existe
  if (window.google?.maps) return window.google.maps;

  try {
    await new Promise((resolve, reject) => {
      // Definimos un callback global temporal para que Maps notifique cuando esté 100% listo
      window.mapsReady = () => {
        delete window.mapsReady;
        resolve();
      };

      const s = document.createElement('script');
      // Agregamos &callback=mapsReady. Sin esto, loading=async dispara onload prematuramente.
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=mapsReady`;
      s.async = true;
      s.defer = true;
      s.onerror = () => { delete window.mapsReady; reject(); };
      document.head.appendChild(s);
    });

    return window.google.maps;

  } catch {
    return null;
  }
}

export async function getDistance(maps, origin, dest) {
  if (!maps) return mockDistance();

  return new Promise((resolve, reject) => {
    const svc = new maps.DistanceMatrixService();

    svc.getDistanceMatrix({
      origins: [origin],
      destinations: [dest],
      travelMode: maps.TravelMode.DRIVING
    }, (res, status) => {
      if (status !== "OK") return reject();

      resolve(res.rows[0].elements[0]);
    });
  });
}

export async function getAddressFromCoords(maps, lat, lng) {
  if (!maps) return null;
  
  const geocoder = new maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0]) {
        resolve(results[0]);
      } else {
        reject("No se pudo encontrar la dirección");
      }
    });
  });
}

// fallback si no hay maps
function mockDistance() {
  return {
    distance: { value: 5000, text: "5 km" }
  };
}