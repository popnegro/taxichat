import { Server } from 'socket.io';

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log('--- Inicializando Socket.io ---');
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: '*', // Permitir conexiones de cualquier origen
      },
    });

    io.on('connection', (socket) => {
      console.log('Conexión establecida:', socket.id);

      // ESCUCHAR: El evento que viene del client.html
      socket.on('nuevo-viaje', (data) => {
        console.log('Nuevo viaje recibido de un cliente:', data);
        
        // EMITIR: Reenviar a todos (incluyendo al operator.html)
        // Usamos io.emit para que llegue a todas las ventanas abiertas
        io.emit('viaje-recibido', data);
      });

      socket.on('disconnect', () => {
        console.log('Usuario desconectado');
      });
    });

    res.socket.server.io = io;
  }
  res.end();
}