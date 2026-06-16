/**
 * PATSCompare
 * socket-server.js
 * Execucao do servidor de Socket IO
 * Escuta a fila BullMQ e encaminha como mensagens Socket
 * PATS Technologies
 * 16/06/2026
 */
import { createServer } from 'http';
import express from 'express'; // small express server to attach socket
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { QueueEvents } from 'bullmq';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

const port = Number(process.env.SOCKET_PORT || 5001);

(async () => {
  await pubClient.connect();
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));
  
  io.on('connection', socket => {
    socket.on('join', jobId => {
      socket.join(jobId);
    });
  });

  const queueEvents = new QueueEvents(
    'compare-queue', 
    { connection: { host: process.env.REDIS_HOST || 'redis' } }
  );

  queueEvents.on('progress', ({ jobId, data }) => {
    // BullMQ QueueEvents progress gives jobId string and data object (progress)
    // emit to socket.io room with same jobId
    try {
      io
      .to(jobId)
      .emit('progress', data);
    } catch (e) {
      console.warn('PATSCompare Socker server - aviso: socket emit failed', e);
    }
  });

  queueEvents.on('completed', async ({ jobId, returnvalue }) => {
    io
    .to(jobId)
    .emit('progress', 
      { jobId, 
        ready: true, 
        message: 'Pronto!', 
        done: returnvalue?.totalPages || 1, 
        total: returnvalue?.totalPages || 1 
      }
    );
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    io
    .to(jobId)
    .emit('progress', 
      { jobId, 
        error: true, 
        message: failedReason 
      }
    );
  });

  server.listen(port, () => console.log(`PATSCompare Socket server ouvindo na porta ${port}`));
})();
