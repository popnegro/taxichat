import { Server } from 'socket.io';

export default function handler(req, res) {
  if (res.socket.server.io) {
    console.log('Socket ya está corriendo');
  } else {
    console.log('Inicializando Socket.io...');
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
    });
    res.socket.server.io = io;

    io.on('connection', (socket) => {
      console.log('Cliente conectado:', socket.id);
      
      socket.on('enviar-viaje', (datos) => {
        socket.broadcast.emit('nuevo-viaje', datos);
      });
    });
  }
  res.end();
}