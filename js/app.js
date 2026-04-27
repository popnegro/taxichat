import { loadConfig } from './config.js';
import { calculateFare } from './fare.js';
import { loadMaps, getDistance, getAddressFromCoords } from './maps.js';
import { saveLead } from './api.js';
import { addMessage } from './ui.js';

// Declarar variables para los elementos, pero no asignarlas aún.
// Se asignarán después de que el template sea inyectado en el DOM.
let chat, originAutocompleteElement, destAutocompleteElement, destWrapper, backBtn, clearOriginBtn, clearDestBtn, nextBtn, wsBtn, statusInfo, successLayer, leadIdSpan, closeSuccessBtn, helpBtn, faqModal, closeFaqBtn, mapContainer;
let headerTitleElement, headerSubtitleElement, headerLogoElement;

// Variables de estado y configuración
let state = 0;
let config, maps, map; // Añadimos 'map' a las variables globales
let originPlace = null;
let destinationPlace = null;
let originMarker, destinationMarker; // Marcadores para el mapa
let directionsRenderer; // Nuevo: para dibujar la ruta

// Función para cargar e inyectar el template HTML
async function loadAndInjectTemplate() {
  try {
    const templateUrl = new URL('../partials/widget-template.html', import.meta.url);
    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error('Failed to load widget template');
    const templateHtml = await response.text();
    document.body.insertAdjacentHTML('afterbegin', templateHtml); // Insertar al principio del body
    return true;
  } catch (error) {
    console.error('Error loading widget template:', error);
    // Fallback o mensaje de error si el template falla en cargar
    document.body.innerHTML = '<p style="color: red;">Error al cargar la interfaz. Por favor, recarga la página.</p>';
    return false;
  }
}

// Definir funciones de utilidad en el scope global del módulo
const updateClearBtn = (input, btn) => {
  if (input && input.value && input.value.length > 0) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
};

/**
 * Aplica automáticamente el tema según la hora del día.
 * Día (6am - 6pm): Tema Original (Light/Yellow)
 * Noche (6pm - 6am): Tema Default (Dark/Silver)
 */
const applyAutoTheme = () => {
  const hour = new Date().getHours();
  const isDaytime = hour >= 6 && hour < 18;
  
  document.body.classList.toggle('theme-original', isDaytime);
};

// Diferir la inicialización para mejorar el TBT (Total Blocking Time)
// requestIdleCallback permite que el navegador termine el renderizado inicial antes de ejecutar JS pesado
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => init());
} else {
  window.addEventListener('load', init);
}

async function init() {
  // 1. Cargar e inyectar el template HTML en el DOM
  const templateLoaded = await loadAndInjectTemplate();
  if (!templateLoaded) return; // Detener si no se pudo cargar la UI

  // 2. Ahora que el template está en el DOM, seleccionar todos los elementos
  chat = document.getElementById('chat-content');
  originAutocompleteElement = document.getElementById('origin-autocomplete');
  destAutocompleteElement = document.getElementById('destination-autocomplete');
  destWrapper = document.getElementById('destination-wrapper');
  backBtn = document.getElementById('back-btn');
  clearOriginBtn = document.getElementById('clear-origin');
  clearDestBtn = document.getElementById('clear-destination');
  nextBtn = document.getElementById('next-btn');
  wsBtn = document.getElementById('ws-btn');
  statusInfo = document.getElementById('status-info');
  successLayer = document.getElementById('success-layer');
  leadIdSpan = document.getElementById('lead-id');
  closeSuccessBtn = document.getElementById('close-success');
  helpBtn = document.getElementById('help-btn');
  faqModal = document.getElementById('faq-modal');
  closeFaqBtn = document.getElementById('close-faq');
  mapContainer = document.getElementById('map-container');

  // Elementos del encabezado para personalización
  headerTitleElement = document.getElementById('header-title');
  headerSubtitleElement = document.getElementById('header-subtitle');
  headerLogoElement = document.getElementById('header-logo');

  // Aplicar tema según horario
  applyAutoTheme();

  // Personalizar el encabezado del chat según los atributos data- del body
  customizeHeader();

  config = await loadConfig();
  maps = await loadMaps(config.mapsKey);
  if (!maps) {
    console.error("Google Maps API no pudo ser cargada. Verifica tu API Key y la conexión a internet.");
    statusInfo.innerHTML = '<span style="color: #d32f2f;">❌ Error: No se pudo cargar el mapa. Verifica tu API Key.</span>';
  }

  // Inicializar el mapa de Google
  if (maps) {
    map = new maps.Map(document.getElementById('map'), {
      center: { lat: -32.8895, lng: -68.8458 }, // Centro por defecto (Mendoza)
      zoom: 12,
      mapId: "DEMO_MAP_ID", // Requerido para AdvancedMarkerElement
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
    });
    // Inicializar Directions Renderer
    directionsRenderer = new maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true // Usaremos nuestros propios marcadores
    });
  }

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
          if (result && result.formatted_address) {
            originAutocompleteElement.value = result.formatted_address;
            originPlace = result;
          }
          statusInfo.textContent = "";
        } catch (err) {
          console.warn("Error en reverse geocoding:", err);
          originAutocompleteElement.placeholder = "📍 Ingresa origen";
          statusInfo.textContent = "";
        }
      },
      () => {
        originAutocompleteElement.placeholder = "📍 Ingresa origen";
        statusInfo.textContent = "";
      }
    );
  } else {
    originAutocompleteElement.placeholder = "📍 Ingresa origen";
  }

  // Resetear validación al escribir
  originAutocompleteElement.addEventListener('input', () => { 
    originPlace = null; 
    statusInfo.textContent = ""; 
    nextBtn.textContent = 'Continuar'; 
    updateClearBtn(originAutocompleteElement, clearOriginBtn);
  });
  destAutocompleteElement.addEventListener('input', () => { 
    destinationPlace = null; 
    statusInfo.textContent = ""; 
    nextBtn.textContent = 'Continuar'; 
    updateClearBtn(destAutocompleteElement, clearDestBtn);
  });

  // Los botones de limpiar ahora interactúan con el valor del PlaceAutocompleteElement
  clearOriginBtn.onclick = () => {
    originAutocompleteElement.value = '';
    originPlace = null;
    updateClearBtn(originAutocompleteElement, clearOriginBtn);
    originAutocompleteElement.focus();
  };

  clearDestBtn.onclick = () => {
    destAutocompleteElement.value = '';
    destinationPlace = null;
    updateClearBtn(destAutocompleteElement, clearDestBtn);
    destAutocompleteElement.focus();
  };

  // Inicializar marcadores (ocultos por defecto)
  if (maps && map) {
    const originImg = document.createElement('img');
    // Usar new URL permite cambiar a '../img/marker-green.png' fácilmente en el futuro
    originImg.src = new URL('https://maps.google.com/mapfiles/ms/icons/green-dot.png', import.meta.url).href;
    originImg.width = 32;

    const destImg = document.createElement('img');
    // La resolución de URL absoluta externa se mantiene igual, pero el patrón es consistente
    destImg.src = new URL('https://maps.google.com/mapfiles/ms/icons/red-dot.png', import.meta.url).href;
    destImg.width = 32;

    // Usamos AdvancedMarkerElement en lugar de Marker
    originMarker = new maps.marker.AdvancedMarkerElement({ map: null, content: originImg });
    destinationMarker = new maps.marker.AdvancedMarkerElement({ map: null, content: destImg });
  }
  // Initialize Google Maps PlaceAutocompleteElement
  if (maps && maps.places && maps.places.PlaceAutocompleteElement) {
    const mendozaBounds = new maps.LatLngBounds(
      new maps.LatLng(-33.0512, -68.9665), // Suroeste (Luján de Cuyo/Maipú)
      new maps.LatLng(-32.8125, -68.7300)  // Noreste (Las Heras/Guaymallén)
    );

    // Asignar los límites geográficos a los PlaceAutocompleteElement
    [originAutocompleteElement, destAutocompleteElement].forEach(el => {
      el.bounds = mendozaBounds;
      el.types = ['address'];
      el.componentRestrictions = { country: 'ar' };
    });

    // Escuchar el evento 'gmp-placeselect' para obtener el lugar seleccionado
    originAutocompleteElement.addEventListener('gmp-placeselect', (event) => {
      originPlace = event.detail.place;
      if (!originPlace.geometry) originPlace = null;
      if (originPlace && destinationPlace) nextBtn.textContent = 'Cotizar viaje';

      // Centrar el mapa y añadir marcador para el origen
      if (map && originPlace && originPlace.geometry && originPlace.geometry.location) {
        map.setCenter(originPlace.geometry.location);
        map.setZoom(15); // Un buen nivel de zoom para una dirección
        mapContainer.style.height = '200px'; // Mostrar el mapa
        originMarker.position = originPlace.geometry.location;
        originMarker.map = map;
      }
    });

    destAutocompleteElement.addEventListener('gmp-placeselect', (event) => {
      destinationPlace = event.detail.place;
      if (!destinationPlace.geometry) destinationPlace = null;
      if (originPlace && destinationPlace) nextBtn.textContent = 'Cotizar viaje';

      // Centrar el mapa y añadir marcador para el destino
      if (map && destinationPlace && destinationPlace.geometry && destinationPlace.geometry.location) {
        map.setCenter(destinationPlace.geometry.location);
        map.setZoom(15); // Un buen nivel de zoom para una dirección
        mapContainer.style.height = '200px'; // Mostrar el mapa
        destinationMarker.position = destinationPlace.geometry.location;
        destinationMarker.map = map;
      }
    });
  } else {
    console.warn("Google Maps Places Autocomplete not available.");
  }
}

// Función para personalizar el encabezado del chat
function customizeHeader() {
  const body = document.body;
  const customTitle = body.dataset.headerTitle || document.title.split('|')[0].trim() || 'TaxiChat';
  const customSubtitle = body.dataset.headerSubtitle || 'Cotizá tu viaje en Mendoza'; // Valor por defecto
  let customLogoSrc = body.dataset.logoSrc;

  if (headerTitleElement) headerTitleElement.textContent = customTitle;
  if (headerSubtitleElement) headerSubtitleElement.textContent = customSubtitle;
  
  if (customLogoSrc && headerLogoElement) {
    // Si el path del logo en el HTML es relativo (ej: ../img/logo.png), 
    // lo resolvemos respecto al script para evitar fallos desde subcarpetas.
    if (!customLogoSrc.startsWith('http') && !customLogoSrc.startsWith('/')) {
      customLogoSrc = new URL(customLogoSrc, window.location.origin + window.location.pathname).href;
    }
    headerLogoElement.src = customLogoSrc;
    headerLogoElement.classList.remove('hidden'); // Mostrar el logo si se proporciona una URL
  }
};

// Nueva función para dibujar la ruta en el mapa
async function displayRoute(origin, destination) {
  if (!maps || !map || !directionsRenderer) return;

  const directionsService = new maps.DirectionsService();

  const request = {
    origin: origin,
    destination: destination,
    travelMode: maps.TravelMode.DRIVING,
  };

  try {
    const response = await directionsService.route(request);
    directionsRenderer.setDirections(response);
    // El DirectionsRenderer ajusta automáticamente el viewport para la ruta.
  } catch (e) {
    console.error("Error al dibujar la ruta:", e);
    // Si hay un error, limpiar cualquier ruta previa
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
  }
}

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
    mapContainer.style.height = '0'; // Ocultar el mapa
    originMarker.map = null;
    destinationMarker.map = null;
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] }); // Limpiar ruta
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
    destinationMarker.map = null;
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] }); // Limpiar ruta
  }
};

function getAddressLink(place) {
  const address = place.formattedAddress || place.formatted_address || place.displayName || "Ubicación";
  const components = place.addressComponents || place.address_components || [];
  const location = place.location || place.geometry?.location;

  const getComp = (type) => components.find(c => c.types.includes(type))?.long_name || "";

  const street = getComp("route");
  const number = getComp("street_number");
  const dept = getComp("administrative_area_level_2") || getComp("locality");

  const label = `${street} ${number}${dept ? ', ' + dept : ''}`.trim() || address;
  
  if (!location) return label;

  const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
  const lng = typeof location.lng === 'function' ? location.lng() : location.lng;
  
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
  // Mostramos la capa de éxito
  successLayer.style.display = 'flex';
};

closeSuccessBtn.onclick = () => {
  // 1. Ocultar la pantalla de éxito
  successLayer.style.display = 'none';
  
  // 2. Resetear variables y visibilidad
  state = 0;
  originAutocompleteElement.value = ''; 
  destAutocompleteElement.value = '';
  wsBtn.style.display = 'none';
  wsBtn.classList.remove('pulse-whatsapp'); // Asegurarse de remover la animación al resetear
  nextBtn.disabled = false;
  backBtn.classList.add('hidden');
  mapContainer.style.height = '0'; // Ocultar el mapa
  originMarker.map = null;
  destinationMarker.map = null;
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
    const val = originAutocompleteElement?.value?.trim(); 
    if (!val) return showError("Por favor, ingresa una dirección de origen.");

    if (!originPlace) {
      statusInfo.textContent = "🔍 Verificando origen...";
      originPlace = await validateAddress(val);
    }
    if (!originPlace) return showError("No encontramos esa dirección en Mendoza.");

    originAutocompleteElement.value = originPlace.formatted_address || originPlace.name; // Actualizar el valor del nuevo componente
    statusInfo.textContent = ""; 
    updateClearBtn(originAutocompleteElement, clearOriginBtn);

    destWrapper.classList.remove('hidden'); // Mostrar el campo de destino
    addMessage(chat, 'user', getAddressLink(originPlace));

    addMessage(chat, 'bot', '¿A dónde vas?');
    state = 1;

  } else if (state === 1) {
    const val = destAutocompleteElement?.value?.trim();
    if (!val) return showError("Por favor, ingresa una dirección de destino.");

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

    destAutocompleteElement.value = destinationPlace.formatted_address || destinationPlace.name; // Actualizar el valor del nuevo componente
    nextBtn.textContent = 'Cotizar viaje';

    addMessage(chat, 'user', getAddressLink(destinationPlace));
    nextBtn.disabled = true;

    // Dibujar la ruta en el mapa
    if (originPlace && destinationPlace && originPlace.geometry && destinationPlace.geometry) {
      // Ocultar marcadores individuales antes de dibujar la ruta
      originMarker.map = null;
      destinationMarker.map = null;
      await displayRoute(originPlace.geometry.location, destinationPlace.geometry.location);
      mapContainer.style.height = '200px'; // Asegurar que el mapa esté visible
    }

    // 1. Mostrar indicador de búsqueda en el chat
    const loadingMsg = addMessage(chat, 'bot', `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="radar-small"></div>
        <span>Buscando conductores...</span>
      </div>
    `);

    try {
      // Realizamos el cálculo en paralelo a la animación
      const data = await getDistance(maps, originAutocompleteElement.value, destAutocompleteElement.value); // Usar valores de los nuevos componentes
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

      // Generamos el ID aquí para que sea consistente en el mensaje y en la UI final
      const trackingId = Math.floor(Math.random() * 90000) + 10000;
      leadIdSpan.textContent = `TX-${trackingId}`;

      const msg = encodeURIComponent(
        `🚖 *Nuevo Pedido - Taxi Chat*\n\n` +
        `🆔 *ID:* TX-${trackingId}\n` +
        `📍 *Origen:* ${originAutocompleteElement.value}\n` + // Usar valor del nuevo componente
        `🏁 *Destino:* ${destAutocompleteElement.value}\n` + // Usar valor del nuevo componente
        `💰 *Precio estimado:* $${price}\n` +
        `📏 *Distancia:* ${data.distance.text}\n` +
        `⏱️ *Tiempo estimado de llegada:* ${data.duration.text}\n\n` +
        `_Confirmar viaje y detalles con operadora_`
      );

      wsBtn.href = `https://wa.me/${config.whatsapp}?text=${msg}`;
      wsBtn.style.display = 'block';
      wsBtn.classList.add('pulse-whatsapp'); // Añadir la animación cuando el botón se muestra
      nextBtn.classList.add('hidden');

      await saveLead({
        origin: originAutocompleteElement.value, // Usar valor del nuevo componente
        destination: destAutocompleteElement.value, // Usar valor del nuevo componente
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