import { loadConfig } from './config.js';
import { calculateFare } from './fare.js';
import { loadMaps, getDistance, getAddressFromCoords } from './maps.js';
import { saveLead } from './api.js';
import { addMessage } from './ui.js';

const chat = document.getElementById('chat-content');
const originInput = document.getElementById('origin');
const destInput = document.getElementById('destination');
const destWrapper = document.getElementById('destination-wrapper');
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const wsBtn = document.getElementById('ws-btn');
const statusInfo = document.getElementById('status-info');
const successLayer = document.getElementById('success-layer');
const leadIdSpan = document.getElementById('lead-id');
const closeSuccessBtn = document.getElementById('close-success');
const helpBtn = document.getElementById('help-btn');
const faqModal = document.getElementById('faq-modal');
const closeFaqBtn = document.getElementById('close-faq');
const themeToggle = document.getElementById('theme-toggle');

let state = 0;
let config, maps;
let originPlace = null;
let destinationPlace = null;

// Diferir la inicialización para mejorar el TBT (Total Blocking Time)
// requestIdleCallback permite que el navegador termine el renderizado inicial antes de ejecutar JS pesado
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => init());
} else {
  window.addEventListener('load', init);
}

async function init() {
  // Cargar tema guardado
  if (localStorage.getItem('theme') === 'original') {
    document.body.classList.add('theme-original');
    const icon = themeToggle.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'toggle_off';
  }

  config = await loadConfig();
  maps = await loadMaps(config.mapsKey);

  // Remover esqueletos de carga antes de iniciar la conversación real
  chat.innerHTML = '';

  addMessage(chat, 'bot', 'Hola 👋 ¿Desde dónde salís?');

  // Intentar geolocalizar al usuario
  if (navigator.geolocation) {
    statusInfo.textContent = "Detectando tu ubicación...";
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const result = await getAddressFromCoords(maps, lat, lng);
          originInput.value = result.formatted_address;
          originPlace = result;
          statusInfo.textContent = "";
        } catch (err) {
          console.warn("Error en reverse geocoding:", err);
          originInput.placeholder = "📍 Ingresa origen";
          statusInfo.textContent = "";
        }
      },
      () => {
        originInput.placeholder = "📍 Ingresa origen";
        statusInfo.textContent = "";
      }
    );
  } else {
    originInput.placeholder = "📍 Ingresa origen";
  }

  // Resetear validación al escribir
  originInput.addEventListener('input', () => { originPlace = null; statusInfo.textContent = ""; nextBtn.textContent = 'Continuar'; });
  destInput.addEventListener('input', () => { destinationPlace = null; statusInfo.textContent = ""; nextBtn.textContent = 'Continuar'; });

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
      originPlace = originAutocomplete.getPlace();
      if (!originPlace.geometry) originPlace = null;
      if (originPlace && destinationPlace) nextBtn.textContent = 'Cotizar viaje';
    });
    destAutocomplete.addListener('place_changed', () => {
      destinationPlace = destAutocomplete.getPlace();
      if (!destinationPlace.geometry) destinationPlace = null;
      if (originPlace && destinationPlace) nextBtn.textContent = 'Cotizar viaje';
    });
  } else {
    console.warn("Google Maps Places Autocomplete not available. Check API key and 'places' library loading.");
  }
}

themeToggle.onclick = () => {
  document.body.classList.toggle('theme-original');
  const isOriginal = document.body.classList.contains('theme-original');
  localStorage.setItem('theme', isOriginal ? 'original' : 'silver');
  const icon = themeToggle.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = isOriginal ? 'toggle_off' : 'toggle_on';
};

helpBtn.onclick = () => {
  faqModal.style.display = 'flex';
};

closeFaqBtn.onclick = () => {
  faqModal.style.display = 'none';
};

// Cerrar modal al hacer clic fuera del contenido
faqModal.onclick = (e) => {
  if (e.target === faqModal) faqModal.style.display = 'none';
};

backBtn.onclick = () => {
  if (state === 1) {
    // Volver de Destino a Origen
    state = 0;
    destWrapper.classList.add('hidden');
    backBtn.classList.add('hidden');
    nextBtn.textContent = 'Continuar';
    // Limpiar burbujas de chat para mantener el hilo limpio
    if (chat.children.length >= 2) {
      chat.removeChild(chat.lastElementChild); // Bot: ¿A dónde vas?
      chat.removeChild(chat.lastElementChild); // User: Dirección Origen
    }
  } else if (state === 2) {
    // Volver de Precio/WhatsApp a Cotización
    state = 1;
    wsBtn.style.display = 'none';
    wsBtn.classList.remove('pulse-whatsapp');
    nextBtn.classList.remove('hidden');
    nextBtn.disabled = false;
    nextBtn.textContent = 'Cotizar viaje';
    // Eliminar la burbuja del precio
    if (chat.lastElementChild.classList.contains('price-highlight')) {
      chat.removeChild(chat.lastElementChild);
    }
  }
};

function getAddressLink(place) {
  if (!place || !place.geometry) return place?.formatted_address || "Ubicación";

  const components = place.address_components || [];
  const getComp = (type) => components.find(c => c.types.includes(type))?.long_name || "";

  const street = getComp("route");
  const number = getComp("street_number");
  const dept = getComp("administrative_area_level_2") || getComp("locality");

  const label = `${street} ${number}${dept ? ', ' + dept : ''}`.trim() || place.formatted_address;
  
  const lat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
  const lng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
  
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  
  return `<a href="${url}" target="_blank" style="color: inherit; text-decoration: none; font-weight: bold;">${label}</a>`;
}

async function validateAddress(address) {
  if (!maps) return { formatted_address: address };
  const geocoder = new maps.Geocoder();
  const mendozaBounds = new maps.LatLngBounds(
    new maps.LatLng(-33.0512, -68.9665),
    new maps.LatLng(-32.8125, -68.7300)
  );

  return new Promise((resolve) => {
    geocoder.geocode({ address, bounds: mendozaBounds, componentRestrictions: { country: 'ar' } }, (results, status) => {
      if (status === "OK" && results[0]) {
        resolve(results[0]);
      } else {
        resolve(null);
      }
    });
  });
};

wsBtn.onclick = () => {
  // Generamos un ID de seguimiento aleatorio para mostrar en la pantalla
  const trackingId = Math.floor(Math.random() * 90000) + 10000;
  leadIdSpan.textContent = `TX-${trackingId}`;

  // Mostramos la capa de éxito
  successLayer.style.display = 'flex';
};

closeSuccessBtn.onclick = () => {
  // 1. Ocultar la pantalla de éxito
  successLayer.style.display = 'none';
  
  // 2. Resetear variables y visibilidad
  state = 0;
  originInput.value = '';
  destInput.value = '';
  destWrapper.classList.add('hidden');
  wsBtn.style.display = 'none';
  wsBtn.classList.remove('pulse-whatsapp'); // Asegurarse de remover la animación al resetear
  nextBtn.disabled = false;
  backBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');
  nextBtn.textContent = 'Continuar';
  statusInfo.textContent = '';

  // 3. Reiniciar el chat visualmente
  chat.innerHTML = '';
  addMessage(chat, 'bot', 'Hola 👋 ¿Desde dónde salís?');
};

const showError = (msg) => {
  statusInfo.innerHTML = `<span style="color: #d32f2f;">❌ ${msg}</span>`;
  setTimeout(() => { if (statusInfo.innerHTML.includes('❌')) statusInfo.textContent = ""; }, 5000);
};

nextBtn.onclick = async () => {
  if (state === 0) {
    const val = originInput.value.trim();
    if (!val) return;

    if (!originPlace) {
      statusInfo.textContent = "🔍 Verificando origen...";
      originPlace = await validateAddress(val);
    }

    if (!originPlace) return showError("No encontramos esa dirección en Mendoza.");

    originInput.value = originPlace.formatted_address || originPlace.name;
    statusInfo.textContent = "";

    backBtn.classList.remove('hidden');
    addMessage(chat, 'user', getAddressLink(originPlace));
    destWrapper.classList.remove('hidden');

    addMessage(chat, 'bot', '¿A dónde vas?');
    state = 1;

  } else if (state === 1) {
    const val = destInput.value.trim();
    if (!val) return;

    if (!destinationPlace) {
      statusInfo.textContent = "🔍 Verificando destino...";
      destinationPlace = await validateAddress(val);
    }

    if (!destinationPlace) return showError("No encontramos el destino en Mendoza.");

    // Validar que origen y destino no sean iguales
    const isSameId = originPlace.place_id && destinationPlace.place_id && originPlace.place_id === destinationPlace.place_id;
    const isSameAddr = originPlace.formatted_address === destinationPlace.formatted_address;

    if (isSameId || isSameAddr) {
      destinationPlace = null;
      return showError("El origen y el destino no pueden ser el mismo lugar.");
    }

    destInput.value = destinationPlace.formatted_address || destinationPlace.name;
    nextBtn.textContent = 'Cotizar viaje';

    addMessage(chat, 'user', getAddressLink(destinationPlace));
    nextBtn.disabled = true;

    // 1. Mostrar indicador de búsqueda en el chat
    const loadingMsg = addMessage(chat, 'bot', `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="radar-small"></div>
        <span>Buscando conductores...</span>
      </div>
    `);

    try {
      // Realizamos el cálculo en paralelo a la animación
      const data = await getDistance(maps, originInput.value, destInput.value);
      const price = calculateFare(data.distance.value, config.rates);

      // 2. Espera de búsqueda de conductores (2 segundos)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. Transición a búsqueda de precio
      loadingMsg.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="radar-small"></div>
          <span>Buscando el mejor precio...</span>
        </div>
      `;
      
      // 4. Espera de cálculo de precio (2 segundos)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Eliminar burbuja de carga y mostrar resultado destacado
      loadingMsg.remove();
      statusInfo.textContent = "";

      const priceHTML = `
        <div class="price-card">
          <span class="price-label">Tarifa Estimada</span>
          <span class="price-total">$${price}</span>
          <div class="price-details">
            <div class="price-detail-item">
              <span class="material-symbols-outlined">route</span>
              <span>${data.distance.text}</span>
            </div>
            <div class="price-detail-item">
              <span class="material-symbols-outlined">schedule</span>
              <span>${data.duration.text}</span>
            </div>
          </div>
        </div>
      `;
      const priceBubble = addMessage(chat, 'bot', priceHTML);
      priceBubble.classList.add('price-highlight');

      const msg = encodeURIComponent(
        `Taxi Mendoza\nOrigen: ${originInput.value}\nDestino: ${destInput.value}\nPrecio: $${price}`
      );

      wsBtn.href = `https://wa.me/${config.whatsapp}?text=${msg}`;
      wsBtn.style.display = 'block';
      wsBtn.classList.add('pulse-whatsapp'); // Añadir la animación cuando el botón se muestra
      nextBtn.classList.add('hidden');

      await saveLead({
        origin: originInput.value,
        destination: destInput.value,
        price
      });

      state = 2;
    } catch (error) {
      console.error("Error calculating fare:", error);
      if (loadingMsg) loadingMsg.remove();
      statusInfo.innerHTML = '<span style="color: #d32f2f;">❌ Error al calcular. Verifica las direcciones.</span>';
      nextBtn.disabled = false;

      // El mensaje desaparece tras 5 segundos si sigue siendo un error
      setTimeout(() => {
        if (statusInfo.innerHTML.includes('❌')) statusInfo.textContent = "";
      }, 5000);
    }
  }
};