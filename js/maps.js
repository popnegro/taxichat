export async function loadMaps(apiKey) {
  if (!apiKey) return null;

  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      s.onload = resolve;
      s.onerror = reject;
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

// fallback si no hay maps
function mockDistance() {
  return {
    distance: { value: 5000, text: "5 km" }
  };
}