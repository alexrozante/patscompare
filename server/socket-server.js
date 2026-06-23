/**
 * PATSCompare
 * socket-server.js
 * Redis to Clients event broker
 * (c) PATS Technologies
 */
import dotenv from 'dotenv';
import express from 'express'; // small express server to attach socket
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { createServer } from 'http';
import { log, setLogLevel, LOG_NORMAL, LOG_VERBOSE, LOG_DEBUG } from './db.js';
import { QueueEvents } from 'bullmq';
import { Server } from 'socket.io';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const logLevel = Number(process.env.SOCKET_LOG_LEVEL) || LOG_NORMAL;
setLogLevel(logLevel);

await log(LOG_DEBUG, 'socket', 'I', 'socket server loaded.');
await log(LOG_DEBUG, 'socket', 'I', `log level set to ${logLevel}...`);
await log(LOG_DEBUG, 'socket', 'I', `starting connection do database for logging...`);
await log(LOG_DEBUG, 'socket', 'I', `PGHOST=${process.env.PGHOST}`);
await log(LOG_DEBUG, 'socket', 'I', `PGPORT=${process.env.PGPORT}`);
await log(LOG_DEBUG, 'socket', 'I', `PGDATABASE=${process.env.PGDATABASE}`);
await log(LOG_DEBUG, 'socket', 'I', `PGUSER=${process.env.PGUSER}`);

const port = Number(process.env.NEXT_PUBLIC_SOCKET_PORT) || 5001;

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);
//const redisUrl = process.env.REDIS_URL || `redis://${redisHost}:${redisPort}`;

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const pubClient = createClient({ socket: { host: redisHost, port: redisPort } });
const subClient = pubClient.duplicate();

pubClient.on('error', async (err) => {
  console.error('pubClient:');
  console.error(err);
  await log(LOG_DEBUG, 'socket', 'E', `pubClient error: ${String(err.stack || err)}`);
});

subClient.on('error', async (err) => {
  console.error('subClient:');
  console.error(err);
  await log(LOG_DEBUG, 'socket', 'E', `subClient error: ${String(err.stack || err)}`);
});

async function handler() {
  await log(LOG_DEBUG, 'socket', 'I', `connecting to Redis server ${redisHost}:${redisPort}`);
  try {
    await pubClient.connect();
    await log(LOG_DEBUG, 'socket', 'I', `pubClient connected to Redis.`);
  } catch (e) {
    await log(LOG_DEBUG, 'socket', 'E', `pubClient.connect failed: ${String(err.stack || err)}`);
    console.error('pubClient connect:');
    console.error(e);
    throw e;
  }

  try {
    await subClient.connect();
    await log(LOG_DEBUG, 'socket', 'I', `subClient connected to Redis.`);
  } catch (e) {
    console.error('subClient connect:');
    console.error(e);
    await log(LOG_DEBUG, 'socket', 'E', `subClient.connect failed: ${String(err.stack || err)}`);
    throw e;
  }

  io.adapter(createAdapter(pubClient, subClient));
 
  io.on('connection', async (socket) => {
    
    await log(LOG_DEBUG, 'socket', 'I', `client connected ${socket.id}`);

    socket.on('join', async (jobId) => {
      // await log(LOG_DEBUG, 'socket', 'I', `client ${socket.id} join room ${jobId}`);
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
    // await log(LOG_DEBUG, 'socket', 'I', `progress...`);
    try {
      const room = data?.jobId || jobId; // prioriza o UUID da app
      io
      .to(room)
      .emit('progress', data);
    } catch (e) {
      await log(LOG_DEBUG, 'socket', 'E', `failed emit 'progress' for jobId ${jobId}`);
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
      await log(LOG_DEBUG, 'socket', 'E', `failed emit 'completed' for jobId ${jobId}`);
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
      await log(LOG_DEBUG, 'socket', 'E', `failed emit 'failed' for jobId ${jobId}: ${String(e)}`);
    }
  });

  server.listen(port, async () => {await log(LOG_NORMAL, 'socket', 'I', `Socket server listing on port ${port}`)});
}

handler();
