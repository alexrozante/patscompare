/**
 * PATSCompare
 * worker.js
 * Comparison queue agent to process comparisons
 * (c) PATS Technologies
 */
import fs, { createWriteStream, mkdtempSync, copyFileSync, rmSync } from 'fs';
import path from 'path';
import axios from 'axios';
import { pool, log, createComparison, updateComparison, getLogLevel, setLogLevel, LOG_NORMAL, LOG_VERBOSE, LOG_DEBUG } from './db.js';
import { runCompareJob } from './compare.js';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

export async function worker() {

  dotenv.config({ path: '.env.local' });
  if (! process.env.WORKER_LOG_LEVEL) dotenv.config({ path: '.env' });

  setLogLevel(Number(process.env.WORKER_LOG_LEVEL) || LOG_NORMAL);

  await log(LOG_DEBUG, 'worker', 'I', 'worker carregado.');

  const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    retryStrategy(times) { 
      return Math.min(times * 50, 2000); 
    }, // ms
    maxRetriesPerRequest: null
  });
  await log(LOG_VERBOSE, 'worker', 'I', 'conexão com Redis criada.');

  function isUrl(s) {
    return typeof s === 'string' && /^https?:///i.test(s);
  }

  async function downloadToFile(url, dest) {
    const res = await axios.get(url, { responseType: 'stream', timeout: 120000 });
    await new Promise((resolve, reject) => {
      const w = createWriteStream(dest);
      res.data.pipe(w);
      w.on('finish', async () => {
        await log(LOG_VERBOSE, 'worker', 'I', 'download concluido');
        resolve();
      });
      w.on('error', async () => {
        await log(LOG_VERBOSE, 'worker', 'E', 'download nao concluido');
        reject()
      });
    });
  }

  const worker = new Worker(
    'compare-queue', 
    async (job) => {
      const { 
        jobId, 
        title, 
        filenameA, 
        filenameB, 
        aPath, 
        bPath, 
        aUrl, 
        bUrl, 
        params 
      } = job.data;

      // Vale o menor entre a quantidade de paginas requisitadas pela UI e o configurado no ambiente (WORKER_MAX_PAGES)
      const envMaxPages = Number(process.env.WORKER_MAX_PAGES || 0);
      const paramMaxPages = Number(params.MAX_PAGES || 0); 
      params.MAX_PAGES = paramMaxPages > 0 && paramMaxPages < envMaxPages ? paramMaxPages: envMaxPages;

      const workerId = process.env.WORKER_ID || '1';
      const compId = jobId || uuidv4();

      await log(LOG_VERBOSE, 'worker', 'I', `worker ${workerId} comparacao id ${compId} INICIADA ***`);
      await log(LOG_VERBOSE, 'worker', 'I', `MAX_PAGES=${params.MAX_PAGES}, POSFIXA=${params.POSFIXA}, OFFSET=${params.OFFSET}, FATSIM=${params.FATSIM}`);

      await createComparison({ id: compId, title, filenameA, filenameB, inputA: aPath || aUrl, inputB: bPath || bUrl, status: 'running' });
      await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} registrou ${compId} no BD.`);

      const jobsRoot = path.join(process.cwd(), 'data', 'jobs');
      fs.mkdirSync(jobsRoot, { recursive: true });

      const jobDir = path.join(jobsRoot, compId);
      fs.mkdirSync(jobDir, { recursive: true });

      const localA = path.join(jobDir, path.basename(aPath));
      const localB = path.join(jobDir, path.basename(bPath));

      try {
        if (isUrl(aUrl)) {
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - realizando download do arquivo A.`);
          await downloadToFile(aUrl, localA);
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo A recebido.`);

        } else if (aPath) {
          copyFileSync(aPath, localA);
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo A recebido.`);

        } else {
          await log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${compId} - arquivo A nao localizado.`);
          throw new Error('Missing input A');
        }

        if (isUrl(bUrl)) {
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - realizando download do arquivo B.`);
          await downloadToFile(bUrl, localB);
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo B recebido.`);

        } else if (bPath) {
          copyFileSync(bPath, localB);
          await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - arquivo B recebido.`);

        } else {
          await log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${compId} - arquivo B nao localizado.`);
          throw new Error('Missing input B');
        }

        // progress callback mapping to Bull job progress
        const progressCb = async (p) => {
          try {
            await job.updateProgress(Object.assign({ jobId }, p));
          } catch (e) {
            await log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${jobId} - falha ao atualizar progresso do job (worker.progressCb)`);
            await log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} comp ${jobId} - ${String(e)}`);
          }
        };

        // call the refactored compare function
        const result = await 
          runCompareJob(
            getLogLevel(), 
            {
              jobId,
              title,
              aPdf: localA,
              bPdf: localB,
              params: params || {},
              progressCb,
              outputDir: jobDir
            }
          );

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
          page_diffs: result.page_diffs,
          text_diffs: result.text_diffs,
          matches: result.matches,
          artifacts: artifacts,
          error: null
        });
        
        await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} comp ${compId} - resultados salvos no BD.`);

        await job.updateProgress({ jobId, ready: true, done: result.totalPages, total: result.totalPages, message: 'Ok' });

        await log(LOG_VERBOSE, 'worker', 'I', `worker ${workerId} comparacao id ${compId} FINALIZADA ***`);

        return { 
          success: true, 
          totalPages: result.totalPages, 
          page_diffs: result.page_diffs,
          text_diffs: result.text_diffs,
          matches: result.matches, 
          artifacts: result.artifacts 
        };

      } catch (err) {
        await updateComparison(compId, { status: 'failed', error: String(err) });
        await log(LOG_VERBOSE, 'worker', 'I', `worker ${workerId} comparacao id ${compId} ERRO: ${String(err)} ***`);
        throw err;
      }
    }, 
    { 
      connection, 
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10), 
      lockDuration: 30 * 60 * 1000 
    }
  );

  // graceful shutdown
  async function shutdown() {
    const workerId = process.env.WORKER_ID || '1';

    await log(LOG_DEBUG, 'worker', 'I', `worker ${workerId} encerrando.`);

    try { 
      await worker.close(); 
    } catch (e) { 
      await log(LOG_DEBUG, 'worker', 'E', `worker ${workerId} erro ao encerrar: ${String(e)}.`);
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
}

worker();