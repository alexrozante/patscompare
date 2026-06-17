/**
 * PATSCompare
 * db.js
 * Acesso ao banco de dados
 * PATS Technologies
 * 16/06/2026
 */
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'pdfdiff',
  user: process.env.PGUSER || 'pdfdiff',
  password: process.env.PGPASSWORD || 'pdfdiffpw',
  max: Number(process.env.PG_POOL_MAX || 100),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000)
});

async function retry(fn, attempts = 5, delay = 200) {
  let i = 0;
  while (true) {
    try { return await fn(); }
    catch (err) {
      i++;
      const transient = /* check err.code in ['ECONNREFUSED','ECONNRESET','57P01','40001'] */ true;
      if (!transient || i >= attempts) 
        throw err;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i-1)));
    }
  }
}

async function createComparison({ id, inputA, inputB, status = 'queued' }) {
  const res = await retry(() => pool.query(
    'INSERT INTO comparisons (id, status, input_a, input_b) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, status, inputA, inputB]
  ));
  return res.rows[0];
}

async function getComparison(id) {
  const res = await retry(() => pool.query('SELECT * FROM comparisons WHERE id = $1', [id]));
  return res.rows[0];
}

async function updateComparison(id, fields = {}) {
  const keys = Object.keys(fields);
  if (keys.length === 0) 
    return;
  const set = keys.map((k, i) => '${k}=$${i+2}').join(', ');
  const values = [id, ...keys.map(k => fields[k])];
  const qry = `UPDATE comparisons SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`;
  const res = await retry(() => pool.query(qry, values));
  return res.rows[0];
}

export { pool, createComparison, getComparison, updateComparison };