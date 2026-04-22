import { loadConfig } from './config.js';
import { calculateFare } from './fare.js';
import { loadMaps, getDistance } from './maps.js';
import { saveLead } from './api.js';
import { addMessage } from './ui.js';

const chat = document.getElementById('chat');
const originInput = document.getElementById('origin');
const destInput = document.getElementById('dest');
const nextBtn = document.getElementById('next');
const wsBtn = document.getElementById('wsBtn');

let state = 0;
let config, maps;

init();

async function init() {
  config = await loadConfig();
  maps = await loadMaps(config.mapsKey);

  addMessage(chat, 'bot', 'Hola 👋 ¿Desde dónde salís?');
}

nextBtn.onclick = async () => {
  if (state === 0) {
    if (!originInput.value.trim()) return;

    addMessage(chat, 'user', originInput.value);
    destInput.style.display = 'block';

    addMessage(chat, 'bot', '¿A dónde vas?');
    state = 1;

  } else if (state === 1) {
    if (!destInput.value.trim()) return;

    addMessage(chat, 'user', destInput.value);
    nextBtn.disabled = true;

    addMessage(chat, 'bot', 'Calculando tarifa...');

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
  }
};