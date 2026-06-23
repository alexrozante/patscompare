import { createClient } from 'redis';
const c = createClient({ socket: { host: '127.0.0.1', port: 6379 } });
c.on('error', (e) => console.error('ERR', e));
(async () => {
  try {
    await c.connect();
    console.log('CONNECTED');
    const r = await c.ping();
    console.log('PING ->', r);
    await c.disconnect();
  } catch (e) {
    console.error('CONNECT FAILED', e);
  }
})();
