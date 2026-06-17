/**
 * PATSCompare
 * socket-server.js
 * Redis to Clients event broker
 * (c) PATS Technologies
 */
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { createServer } from 'http';
import express from 'express'; // small express server to attach socket
import { log } from './db.js';
import { QueueEvents } from 'bullmq';
import { Server } from 'socket.io';

log('socket', 'I', 'socket server carregado.');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const port = Number(process.env.SOCKET_PORT) || 5001;

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

(async () => {
  log('socket', 'I', 'conectando ao servidor Redis...');
  await pubClient.connect();
  await subClient.connect();
  log('socket', 'I', 'conexao com Redis ok.');

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
      log('socket', 'E', `falha de emit 'progress' para jobId ${jobId}`);
    }
  });

  queueEvents.on('completed', async ({ jobId, returnvalue }) => {
    try {
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
    } catch (e) {
      log('socket', 'E', `falha de emit 'completed' para jobId ${jobId}`);
    }
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    try {
      io
      .to(jobId)
      .emit('progress', 
        { jobId, 
          error: true, 
          message: failedReason 
        }
      );
    } catch (e) {
      log('socket', 'E', `falha de emit 'failed' para jobId ${jobId}`);
    }
  });

  server.listen(port, () => log('socket', 'I', `Socket server ouvindo na porta ${port}`));
})();
