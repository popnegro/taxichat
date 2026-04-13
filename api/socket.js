import { Server } from 'socket.io';

export default function handler(req, res) {
  if (res.socket.server.io) {
    res.end();
    return;
  }

  const io = new Server(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    
    socket.on('nuevo-viaje', (data) => {
      socket.broadcast.emit('viaje-recibido', data);
    });

    socket.on('disconnect', () => {
      console.log('Cliente desconectado');
    });
  });

  res.end();
}