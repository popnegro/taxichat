import { loadConfig } from './config.js';
import { calculateFare } from './fare.js';
import { loadMaps, getDistance, getAddressFromCoords } from './maps.js';
import { saveLead } from './api.js';
import { addMessage } from './ui.js';

const chat = document.getElementById('chat-content');
const originInput = document.getElementById('origin');
const destInput = document.getElementById('destination');
const nextBtn = document.getElementById('next-btn');
const wsBtn = document.getElementById('ws-btn');

let state = 0;
let config, maps;

init();

async function init() {
  config = await loadConfig();
  maps = await loadMaps(config.mapsKey);

  addMessage(chat, 'bot', 'Hola 👋 ¿Desde dónde salís?');

  // Intentar geolocalizar al usuario
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const address = await getAddressFromCoords(maps, lat, lng);
          originInput.value = address;
        } catch (err) {
          console.warn("Error en reverse geocoding:", err);
          originInput.placeholder = "📍 Ingresa origen";
        }
      },
      () => {
        originInput.placeholder = "📍 Ingresa origen";
      }
    );
  } else {
    originInput.placeholder = "📍 Ingresa origen";
  }

  // Initialize Google Maps Autocomplete for origin and destination inputs
  if (maps && maps.places && maps.places.Autocomplete) {
    // Definir los límites aproximados de Mendoza (Gran Mendoza)
    const mendozaBounds = new maps.LatLngBounds(
      new maps.LatLng(-33.0512, -68.9665), // Suroeste (Luján de Cuyo/Maipú)
      new maps.LatLng(-32.8125, -68.7300)  // Noreste (Las Heras/Guaymallén)
    );

    const autocompleteOptions = {
      types: ['address'],
      componentRestrictions: { country: 'ar' },
      bounds: mendozaBounds,
      strictBounds: true // Fuerza a que los resultados estén dentro de los límites definidos
    };

    const originAutocomplete = new maps.places.Autocomplete(originInput, autocompleteOptions);
    const destAutocomplete = new maps.places.Autocomplete(destInput, autocompleteOptions);

    // Optional: Listen for place_changed event if you need to do something when a place is selected
    originAutocomplete.addListener('place_changed', () => {
      const place = originAutocomplete.getPlace();
      if (!place.geometry) console.warn("Origin place details not found for: ", place.name);
    });
    destAutocomplete.addListener('place_changed', () => {
      const place = destAutocomplete.getPlace();
      if (!place.geometry) console.warn("Destination place details not found for: ", place.name);
    });
  } else {
    console.warn("Google Maps Places Autocomplete not available. Check API key and 'places' library loading.");
  }
}

nextBtn.onclick = async () => {
  if (state === 0) {
    if (!originInput.value.trim()) return;

    addMessage(chat, 'user', originInput.value);
    destInput.classList.remove('hidden');

    addMessage(chat, 'bot', '¿A dónde vas?');
    state = 1;

  } else if (state === 1) {
    if (!destInput.value.trim()) return;

    addMessage(chat, 'user', destInput.value);
    nextBtn.disabled = true;

    addMessage(chat, 'bot', 'Calculando tarifa...');

    try {
      const data = await getDistance(maps, originInput.value, destInput.value);
      const price = calculateFare(data.distance.value, config.rates);

      addMessage(chat, 'bot', `💰 $${price} (${data.distance.text})`);

      const msg = encodeURIComponent(
        `Taxi Mendoza\nOrigen: ${originInput.value}\nDestino: ${destInput.value}\nPrecio: $${price}`
      );

      wsBtn.href = `https://wa.me/${config.whatsapp}?text=${msg}`;
      wsBtn.style.display = 'block';

      await saveLead({
        origin: originInput.value,
        destination: destInput.value,
        price
      });

      state = 2;
    } catch (error) {
      console.error("Error calculating fare:", error);
      addMessage(chat, 'bot', 'Lo siento, hubo un error al calcular el viaje. Por favor, verifica las direcciones.');
      nextBtn.disabled = false;
    }
  }
};