/**
 * PATSCompare
 * worker.js
 * Comparison queue agent to process comparisons
 * (c) PATS Technologies
 */
import fs, { createWriteStream, mkdtempSync, copyFileSync, rmSync } from 'fs';
import path from 'path';
import axios from 'axios';
import { pool, log, createComparison, updateComparison, setLogLevel, LOG_NORMAL, LOG_VERBOSE, LOG_DEBUG } from './db.js';
import { runCompareJob } from './compare.js';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

setLogLevel(LOG_DEBUG);
log(LOG_DEBUG, 'worker', 'I', 'worker carregado.');

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  retryStrategy(times) { 
    return Math.min(times * 50, 2000); 
  }, // ms
  maxRetriesPerRequest: null
});
log(LOG_VERBOSE, 'worker', 'I', 'conexão com Redis criada.');

function isUrl(s) {
  return typeof s === 'string' && /^https?:///i.test(s);
}

async function downloadToFile(url, dest) {
  const res = await axios.get(url, { responseType: 'stream', timeout: 120000 });
  await new Promise((resolve, reject) => {
    const w = createWriteStream(dest);
    res.data.pipe(w);
    w.on('finish', () => {
      log(LOG_VERBOSE, 'worker', 'I', 'download concluido');
      resolve();
    });
    w.on('error', () => {
      log(LOG_VERBOSE, 'worker', 'E', 'download nao concluido');
      reject()
    });
  });
}

const worker = new Worker('compare-queue', async job => {

  const { jobId, aUrl, bUrl, aPath, bPath, params } = job.data;

  const workerId = process.env.WORKER_ID || '1';
  const compId = jobId || uuidv4();

  log(LOG_VERBOSE, 'worker', 'I', `worker ${workerId} iniciando comparacao id ${compId}`);

  await createComparison({ id: compId, inputA: aUrl || aPath, inputB: bUrl || bPath, status: 'running' });
  log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} registrou ${compId} no BD.`);

  const jobsRoot = path.join(process.cwd(), 'data', 'jobs');
  fs.mkdirSync(jobsRoot, { recursive: true });

  const jobDir = path.join(jobsRoot, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const localA = path.join(jobDir, path.basename(aPath));
  const localB = path.join(jobDir, path.basename(bPath));

  try {
    if (isUrl(aUrl)) {
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - realizando download do arquivo A.`);
      await downloadToFile(aUrl, localA);
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo A recebido.`);
    } else if (aPath) {
      copyFileSync(aPath, localA);
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo A recebido.`);
    } else {
      log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${compId} - arquivo A nao localizado.`);
      throw new Error('Missing input A');
    }
    if (isUrl(bUrl)) {
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - realizando download do arquivo B.`);
      await downloadToFile(bUrl, localB);
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo B recebido.`);
    } else if (bPath) {
      copyFileSync(bPath, localB);
      log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo B recebido.`);
    } else {
      log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${compId} - arquivo B nao localizado.`);
      throw new Error('Missing input B');
    }
    // progress callback mapping to Bull job progress
    const progressCb = async p => {
      try {
        await job.updateProgress(Object.assign({ jobId }, p));
      } catch (e) {
        log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${jobId} - falha ao atualizar progresso do job (worker.progressCb)`);
        log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${jobId} - ${String(e)}`);
      }
    };

    // call the refactored compare function
    log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - comparacao iniciada.`);
    const result = await runCompareJob({
      jobId,
      aPdf: localA,
      bPdf: localB,
      params: params || {},
      progressCb,
      outputDir: jobDir
    });

    log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - comparacao finalizada.`);

    // Optionally: upload artifacts to S3 here (not implemented)
    // result.artifacts contains local paths: previews/resultPdf/workspace
    // upload artifacts to S3 if desired (not implemented here) and record artifacts paths
    const artifacts = {
      previews: result.artifacts.previews,
      resultPdf: result.artifacts.resultPdf,
      workspace: result.artifacts.workspace
    };

    await updateComparison(compId, {
      status: 'done',
      total_pages: result.totalPages,
      matches: JSON.stringify(result.matches),
      artifacts: JSON.stringify(artifacts),
      error: null
    });
    log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - resultados salvos no BD.`);

    // final progress update (best-effort)
    await job.updateProgress({ jobId, ready: true, done: result.totalPages, total: result.totalPages, message: 'Done' });

    log(LOG_VERBOSE, 'worker', 'I', `worker ${workerId} comp ${compId} - concluida.`);
    return { success: true, totalPages: result.totalPages, matches: result.matches, artifacts: result.artifacts };

   } catch (err) {
    log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${compId} - ${String(err)}`);
    await updateComparison(compId, { status: 'failed', error: String(err) });
    throw err;
  }
}, { 
  connection, 
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10), 
  lockDuration: 30 * 60 * 1000 
});

// graceful shutdown
async function shutdown() {
  const workerId = process.env.WORKER_ID || '1';

  log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} encerrando.`);

  try { 
    await worker.close(); 
  } catch (e) { 
    log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} erro ao encerrar: ${String(e)}.`);
  }
  try { 
    connection.disconnect(); 
  } catch (e) { 
    /* ignore */ 
  }
  try { 
    await pool.end(); 
  } catch (e) { 
    /* ignore */ 
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default worker;