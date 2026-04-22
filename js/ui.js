export function addMessage(chat, type, text) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.innerHTML = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}