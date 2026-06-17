/**
 * PATSCompare
 * worker.js
 * Execucao do servidor de Socket IO
 * Escuta a fila Redis e cria tarefas para comparar arquivos
 * PATS Technologies
 * 16/06/2026
 */
import { createWriteStream, mkdtempSync, copyFileSync, rmSync } from 'fs';
import axios from 'axios';
import { join } from 'path';
import { pool, createComparison, updateComparison } from './db.js';
import { runCompareJob } from './compare.js';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  retryStrategy(times) { return Math.min(times * 50, 2000); }, // ms
  maxRetriesPerRequest: null
});

function isUrl(s) {
  return typeof s === 'string' && /^https?:///i.test(s);
}

async function downloadToFile(url, dest) {
  const res = await axios.get(url, { responseType: 'stream', timeout: 120000 });
  await new Promise((resolve, reject) => {
    const w = createWriteStream(dest);
    res.data.pipe(w);
    w.on('finish', resolve);
    w.on('error', reject);
  });
}

const worker = new Worker('compare-queue', async job => {
  const { jobId, aUrl, bUrl, aPath, bPath, params } = job.data;
  console.log(`[Worker ${process.env.WORKER_ID || '1'}] Processing ${jobId}`);
  // ensure comparison row exists
  const compId = jobId || uuidv4();
  await createComparison({ id: compId, inputA: aUrl || aPath, inputB: bUrl || bPath, status: 'running' });
  const tmpDir = mkdtempSync(join(tmpdir(), `pats-${jobId}-`));
  const localA = join(tmpDir, 'a.pdf');
  const localB = join(tmpDir, 'b.pdf');
  try {
    // download or copy inputs
    if (isUrl(aUrl)) {
      await downloadToFile(aUrl, localA);
    } else if (aPath) {
      copyFileSync(aPath, localA);
    } else {
      throw new Error('Missing input A');
    }
    if (isUrl(bUrl)) {
      await downloadToFile(bUrl, localB);
    } else if (bPath) {
      copyFileSync(bPath, localB);
    } else {
      throw new Error('Missing input B');
    }
    // progress callback mapping to Bull job progress
    const progressCb = async p => {
      try {
        // include jobId to be explicit
        await job.updateProgress(Object.assign({ jobId }, p));
      } catch (e) {
        console.warn('Failed to update job progress', e);
      }
    };
    // call the refactored compare function
    const result = await runCompareJob({
      jobId,
      aPdf: localA,
      bPdf: localB,
      params: params || {},
      progressCb,
      outputDir: join(tmpDir, 'workspace')
    });
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
    // final progress update (best-effort)
    await job.updateProgress({ jobId, ready: true, done: result.totalPages, total: result.totalPages, message: 'Done' });
    console.log(`[Worker ${process.env.WORKER_ID || '1'}] Completed ${jobId}`);
    return { success: true, totalPages: result.totalPages, matches: result.matches, artifacts: result.artifacts };
   } catch (err) {
    console.error(`[Worker ${process.env.WORKER_ID || '1'}] Error ${jobId}:`, err);
    await updateComparison(compId, { status: 'failed', error: String(err) });
    throw err;
  } finally {
    // cleanup tmp dir
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to cleanup tmp dir', tmpDir, e);
    }
  }
}, { connection, concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10), lockDuration: 30 * 60 * 1000 });

// graceful shutdown
async function shutdown() {
  console.log('Shutting down worker...');
   try { await worker.close(); } catch (e) { console.warn('Error closing worker', e); }
  try { connection.disconnect(); } catch (e) { /* ignore */ }
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default worker;