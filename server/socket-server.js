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
import { log, setLogLevel, LOG_NORMAL, LOG_VERBOSE, LOG_DEBUG } from './db.js';
import { QueueEvents } from 'bullmq';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

setLogLevel(Number(process.env.SOCKET_LOG_LEVEL) || LOG_NORMAL);

log(LOG_DEBUG, 'socket', 'I', 'socket server carregado.');

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const port = Number(process.env.SOCKET_PORT) || 5001;

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

async function handler() {
  await log(LOG_DEBUG, 'socket', 'I', 'conectando ao servidor Redis...');
  await pubClient.connect();
  await subClient.connect();
  await log(LOG_DEBUG, 'socket', 'I', 'conexao com Redis ok.');

  io.adapter(createAdapter(pubClient, subClient));
 
  io.on('connection', async (socket) => {
    
    await log(LOG_DEBUG, 'socket', 'I', `client connected ${socket.id}`);

    socket.on('join', async (jobId) => {
      await log(LOG_DEBUG, 'socket', 'I', `client ${socket.id} join room ${jobId}`);
      socket.join(jobId);
    });
  });

  const queueEvents = new QueueEvents(
    'compare-queue', 
    { connection: { host: redisHost, port: redisPort } }
  );

  queueEvents.on('error', async (err) => {
    await log(LOG_DEBUG, 'socket', 'E', `QueueEvents error: ${err}`);
  });

  queueEvents.on('progress', async ({ jobId, data }) => {
    // BullMQ QueueEvents progress gives jobId string and data object (progress)
    // emit to socket.io room with same jobId
    await log(LOG_DEBUG, 'socket', 'I', `progress...`);
    try {
      const room = data?.jobId || jobId; // prioriza o UUID da app
      io
      .to(room)
      .emit('progress', data);
    } catch (e) {
      await log(LOG_DEBUG, 'socket', 'E', `falha de emit 'progress' para jobId ${jobId}`);
    }
  });

  queueEvents.on('completed', async ({ jobId, returnvalue }) => {
    try {
      const room = returnvalue?.jobId || jobId; // prioriza o UUID da app
      io
      .to(room)
      .emit('progress', 
        { jobId: room, 
          ready: true, 
          message: 'Pronto!', 
          done: returnvalue?.totalPages || 1, 
          total: returnvalue?.totalPages || 1 
        }
      );
    } catch (e) {
      await log(LOG_DEBUG, 'socket', 'E', `falha de emit 'completed' para jobId ${jobId}`);
    }
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
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
      await log(LOG_DEBUG, 'socket', 'E', `falha de emit 'failed' para jobId ${jobId}: ${String(e)}`);
    }
  });

  server.listen(port, async () => await log(LOG_NORMAL, 'socket', 'I', `Socket server ouvindo na porta ${port}`));
}

handler();

