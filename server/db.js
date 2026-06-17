/**
 * PATSCompare
 * db.js
 * Database access routines
 * (c) PATS Technologies
 */
import { Pool } from 'pg';
import { sysout } from '../utils/sysout.js';
import { v4 as uuidv4 } from 'uuid';

export const LOG_NORMAL = 1;
export const LOG_VERBOSE = 2;
export const LOG_DEBUG = 3;

let logLevel = Number(process.env.LOG_LEVEL) || 1;  // 1=Basic, 2=Verbose, 3=Debug

/**
 * Sets the application log level:
 * 0 = basic (normal), 1 = detailed (verbose) or 2 = debug (all messages)
 * 
 * @param level a number representing the desired level
 * @returns undefined
 */
export function setLogLevel(level) {
  try {
    const newLevel = Number(level)
    if (level > 0)
      logLevel = level;
  } catch (e) {
    console.error(`Invalid LOG_LEVEL: ${level} -> must be 1=Basic, 2=Detailed or 3=Complete (DEBUG)`);
  }
}

/**
 * Returns the active log level
 * @returns 0 = basic (normal), 1 = detailed (verbose) or 2 = debug
 */
export function getLogLevel() {
  return logLevel;
}

/**
 * Writes a record in the appliaction log table (in the database) or writes to console or both.
 * If the message isn't saved in the database it always be displayed in the server console, even if toConsole was set to false - it's ignored in this case.
 * @param {*} level message level
 * @param {*} module unit of code to help analysis
 * @param {*} type I for Info or E for Error
 * @param {*} message text of the event
 * @param {*} save true to write the message in the database log table. Default = true
 * @param {*} toConsole true to display the message in the server console. Default = true
 * @returns The UUID of the log inserted in the database or null
 */
function log(level, module, type, message, save=true, toConsole=true) {
  if (level > logLevel)
    return Promise.resolve(null);

  if (!save) {
    sysout(module, type, message, type === 'E');
    return Promise.resolve(null);
  }

  return retry(async () => pool.query(
    'INSERT INTO log (id, module, type, message) VALUES ($1, $2, $3, $4) RETURNING id', [uuidv4(), module, type, message]
  )).then((res) => {
    if (toConsole) 
      sysout(module, type, message, type === 'E');
    return res.rows[0].id;
  });
}

// Database connection
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'patscompare',
  user: process.env.PGUSER || 'patscompare',
  password: process.env.PGPASSWORD || '',
  max: Number(process.env.PG_POOL_MAX || 100),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000)
});
log(LOG_DEBUG, 'db', 'I', 'PG Connection (pool): ' + JSON.stringify(pool), true, false);

/**
 * Calls the specified function N times until it begin succeed, waiting the specified delay between attempts.
 * @param {*} fn function to call
 * @param {*} attempts maximum attempts
 * @param {*} delay miliseconds to wait
 * @returns undefined
 * @throws Exception throwed by the called function
 */
async function retry(fn, attempts = 5, delay = 200) {
  let i = 0;
  while (true) {
    try { 
      return await fn(); 
    }
    catch (err) {
      i++;
      const transient = /* check err.code in ['ECONNREFUSED','ECONNRESET','57P01','40001'] */ true;
      if (!transient || i >= attempts) 
        throw err;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i-1)));
    }
  }
}

/**
 * Inserts a comparison in the database comparisons table.
 * @param param0 Object
 * @returns The UUID of the inserted record
 */
async function createComparison({ id, inputA, inputB, status = 'queued' }) {
  const res = await retry(() => pool.query(
    'INSERT INTO comparisons (id, status, input_a, input_b) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, status, inputA, inputB]
  ));
  log(LOG_DEBUG, 'db', 'I', `Record inserted in comparisons. id=${id}, status=${status}, input_a=${inputA}, input_b=${inputB}`);
  return res.rows[0];
}

/**
 * Returns the record of the specified comparison ID
 * @param {*} id comparison UUID
 * @returns database record or undefined
 */
async function getComparison(id) {
  const res = await retry(() => pool.query('SELECT * FROM comparisons WHERE id = $1', [id]));
  return res.rows[0];
}

/**
 * Updates a comparison record in the database
 * @param {*} id - comparison record UUID value
 * @param {*} fields an object with fieldnames as keys and their respective values
 * @returns the updated record as an object
 */
async function updateComparison(id, fields = {}) {
  const keys = Object.keys(fields);
  if (keys.length === 0) 
    return;
  const set = keys.map((k, i) => `${k}=$${i+2}`).join(', ');
  const values = [id, ...keys.map(k => fields[k])];
  const qry = `UPDATE comparisons SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`;
  const res = await retry(() => pool.query(qry, values));
  log(LOG_DEBUG, 'db', 'I', `UPDATE executed: ${qry}`);
  return res.rows[0];
}

export { pool, log, getLogLevel, setLogLevel, createComparison, getComparison, updateComparison };