import { createClient } from 'redis';
(async () => {
  const c = createClient({ url: 'redis://127.0.0.1:6379' });
  c.on('error', (e) => console.error('ERR', e));
  try {
    await c.connect();
    console.log('CONNECTED');
    console.log('PING ->', await c.ping());
    await c.disconnect();
  } catch (e) {
    console.error('CONNECT FAILED', e);
  }
})();
