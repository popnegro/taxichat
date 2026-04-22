export function addMessage(chat, type, text) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}