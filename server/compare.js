/**
 * PATSCompare
 * compare.js
 * PDF comparison service
 * (c) PATS Technologies
 */
import natural from 'natural';
import PDFDocument from 'pdfkit';
import pixelmatch from 'pixelmatch';
import pLimit from 'p-limit';
import sharp from 'sharp';
import util from 'util';
import { diffWordsWithSpace } from 'diff';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import { join } from 'path';
import { pool, log, setLogLevel, LOG_NORMAL, LOG_VERBOSE, LOG_DEBUG } from './db.js';
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync, createWriteStream } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

const { JaroWinklerDistance, LevenshteinDistance } = natural;
               
async function extractTextPerPage(jobId, maxPages, progressCb, pdfPath, suffix) {

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const standardFontDataUrl = resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts/')+'/';

  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data, standardFontDataUrl }).promise;
  const pages = [];
  const normPages = [];

  await progressCb({ jobId, message: `Extraindo textos do PDF ${suffix}...`, done: 0, total: pdf.numPages });      

  const limit = maxPages && maxPages > 0 && maxPages < pdf.numPages ? maxPages : pdf.numPages;

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupa por linhas usando a coordenada Y
    const items = content.items || [];
    let lines = [];
    let currentLine = [];
    let lastY = null;

    // thresholds heurísticos (ajuste se necessário)
    const lineThreshold = 3;   // diferença de Y para nova linha
    const paraThreshold = 15;  // diferença de Y para novo parágrafo (linha em branco)

    for (const item of items) {
      const text = (item.str || '').trim();
      if (!text) continue;

      // pdfjs: transform[5] costuma ser a coordenada Y
      const transform = item.transform || [];
      const y = typeof transform[5] === 'number' ? transform[5] : null;

      if (lastY === null || y === null) {
        currentLine.push(text);
        lastY = y;
        continue;
      }

      const dy = Math.abs(y - lastY);

      if (dy > lineThreshold) {
        // fecha linha anterior
        if (currentLine.length) {
          lines.push({ text: currentLine.join(' '), y: lastY });
          currentLine = [];
        }
        // se o salto for grande, considera um parágrafo (linha em branco)
        if (dy > paraThreshold && lines.length > 0) {
          lines.push({ text: '', y: lastY + dy / 2 });
        }
      }

      currentLine.push(text);
      lastY = y;
    }

    if (currentLine.length) 
      lines.push({ text: currentLine.join(' '), y: lastY });

    // Ordena por Y (caso venha fora de ordem) e junta com \n
    lines.sort((a, b) => b.y - a.y);

    const pageText = lines
      .map(l => l.text)
      .join('\n')
      // não colapsar \n, só espaços repetidos dentro da linha
      .replace(/[ \t]+/g, ' ')
      .trim();

    const normalizedText = normalizeText(pageText);

    // importante: NÃO fazer .toLowerCase() aqui
    // a similaridade já usa normalizeText(), que trata caixa/espaço.
    pages.push(pageText);
    normPages.push(normalizedText);

    if (i % 100 === 0 || i === limit)
      await progressCb({ jobId, message: `Extraindo textos do PDF ${suffix}...`, done: i, total: limit });      
  }
  return [pages, normPages];
}

function normalizeText(text) {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textSimilarity(a, b) {
  if (!a && !b) 
    return 1;

  if (!a || !b) 
    return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) 
    return 1;

  const lev = LevenshteinDistance(a, b);
  const sim = 1 - lev / maxLen;

  return Math.max(0, Math.min(1, sim));
}

async function matchPages(jobId, progressCb, textA, textB, { OFFSET, FATSIM, POSFIXA, MAX_PAGES }) {
  const matches = [];
  const simCache = new Map(); // chave: ${i}|${k} -> número
  let j = 0;

  let maxPagesA = MAX_PAGES && MAX_PAGES > 0 ? MAX_PAGES : textA.length;
  if (MAX_PAGES > textA.length) 
    maxPagesA = textA.length;

  let maxPagesB = MAX_PAGES && MAX_PAGES > 0 ? MAX_PAGES : textB.length;
  if (MAX_PAGES > textB.length) 
    maxPagesB = textB.length;

  const getSim = (i, k) => {
    const key = `${i}|${k}`;
    if (simCache.has(key)) 
      return simCache.get(key);
    const sim = textSimilarity(textA[i], textB[k]);
    simCache.set(key, sim);
    return sim;
  };

  for (let i = 0; i < maxPagesA; i++) {
    if (POSFIXA) {
      const sim = getSim(i, i);
      matches.push({ a: i, b: i, status: 'matched', textSim: sim });
      if (i % 10 === 0 || i + 1 === maxPagesA)
        await progressCb({ jobId, message: 'Relacionando paginas...', done: i+1, total: maxPagesA });
      continue;
    }
    let best = -1;
    let bestScore = 0;
    for (let k = j; k <= Math.min(j + OFFSET, maxPagesB - 1); k++) {
      const sim = getSim(i, k);
      if (sim > bestScore) {
        bestScore = sim;
        best = k;
      }
    }

    if (best !== -1 && bestScore >= FATSIM) {
      while (j < best) {
        matches.push({ b: j, status: 'inserted' });
        j++;
      }
      matches.push({ a: i, b: best, status: 'matched', textSim: bestScore });
      j = best + 1;
    } else {
      matches.push({ a: i, status: 'deleted', textSim: 0 });
    }

    if (i % 100 === 0 || i + 1 === maxPagesA)
      await progressCb({ jobId, message: 'Relacionando paginas...', done: i+1, total: maxPagesA });
  }

  if (POSFIXA) 
    j = maxPagesA;

  while (j < maxPagesB) {
    matches.push({ b: j, status: 'inserted', textSim: 0 });
    j++;
  }
  return matches;
}

async function pdfToPngs(jobId, maxPages, progressCb, pdfPath, outDir, prefix = 'p', pdfSeq = 1, dpi = 96, maxCPU = 2) {
  if (!existsSync(outDir)) 
    mkdirSync(outDir, { recursive: true });

  const outPrefix = join(outDir, prefix);

  const chunkSize = 10;
  const total = maxPages;
  let doneFiles = 0;

  await progressCb({ jobId, message: `Processando imagens do PDF ${pdfSeq}...`, done: 0, total });

  // helper para contar arquivos gerados até agora
  const countFiles = () => readdirSync(outDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.png')).length;

  // cria ranges [1..chunkSize], [chunkSize+1..2*chunkSize], ...
  const ranges = [];
  for (let start = 1; start <= maxPages; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, maxPages);
    ranges.push({ start, end });
  }

  const limitFn = pLimit(Math.max(1, maxCPU));

  // spawn um pdftoppm para um bloco e resolve quando fechar
  const runChunk = ({ start, end }) => new Promise((resolve, reject) => {
    const args = [
      '-png',
      '-f', `${start}`,
      '-l', `${end}`,
      '-r', `${dpi}`,
      '-aa', 'no',
      '-aaVector', 'no',
      pdfPath,
      outPrefix
    ];
    
    log(LOG_DEBUG, 'compare', 'I', `pdftoppm args=${args}`);
    
    const proc = spawn('pdftoppm', args);
    proc.on('close', code => {
      if (code !== 0) 
        return reject(new Error('pdftoppm failed ' + code));
      // contabiliza arquivos gerados até aqui e dispara progress
      const newCount = countFiles();
      // increment pode ser zero if files were already present; use newCount absolute
      doneFiles = newCount;
      // chamar progressCb a cada chunk; você pode condicionar para chamar somente a cada 100 se preferir
      progressCb({ jobId, message: `Processando imagens do PDF ${pdfSeq}...`, done: Math.min(doneFiles, total), total });
      resolve();
    });

    proc.on('error', err => reject(err));
  });

  // executar todas as ranges com limite de paralelismo
  try {
    await Promise.all(ranges.map(r => limitFn(() => runChunk(r))));
  } catch (err) {
    throw err;
  }

  // garantia de atualização final
  const files = readdirSync(outDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  doneFiles = files.length;
  await progressCb({ jobId, message: `Processando imagens do PDF ${pdfSeq}...`, done: Math.min(doneFiles, total), total });

  return files.map(f => join(outDir, f));
}

async function normalizeToSameSize(imgAPath, imgBPath, outA, outB) {
  const metaA = await sharp(imgAPath).metadata();
  const metaB = await sharp(imgBPath).metadata();
  const width = Math.max(metaA.width || 0, metaB.width || 0);
  const height = Math.max(metaA.height || 0, metaB.height || 0);
  await sharp(imgAPath)
    .resize({
      width,
      height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .png()
    .toFile(outA);
  await sharp(imgBPath)
    .resize({
      width,
      height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 }
    })
    .png()
    .toFile(outB);
  return { width, height };
}

async function makeDiffImage(imgAPath, imgBPath, outPath) {
  const tmpA = outPath + '.norm-a.png';
  const tmpB = outPath + '.norm-b.png';

  const { width, height } = await normalizeToSameSize(
    imgAPath,
    imgBPath,
    tmpA,
    tmpB
  );

  const imgA = await sharp(tmpA).ensureAlpha().raw().toBuffer();
  const imgB = await sharp(tmpB).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(width * height * 4);

  const diffPixels = pixelmatch(
    imgA,
    imgB,
    diff,
    width,
    height,
    {
      threshold: 0.1,   // ajuste fino se quiser mais/menos sensível
      includeAA: false,
    }
  );

  const totalPixels = width * height;
  const imageSimilarity = 1 - diffPixels / totalPixels;
  const hasImageDiff = diffPixels > 0;

  if (!hasImageDiff) {
    await sharp(tmpA).toFile(outPath);
  } else {
    await sharp(diff, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(outPath);
  }

  try { rmSync(tmpA, { force: true }); } catch (e) {}
  try { rmSync(tmpB, { force: true }); } catch (e) {}

  return {
    diffPixels,
    totalPixels,
    imageSimilarity,
    hasImageDiff
  };
}

function textDiff(a, b) {
  return diffWordsWithSpace(a || '', b || '').map(part => ({
    type: part.added ? 'added' : part.removed ? 'removed' : 'context',
    value: part.value
  }));
}

async function imagesToPdf(imgPaths, outPdfPath, progressCb) {
  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = createWriteStream(outPdfPath);
  doc.pipe(stream);
  for (const p of imgPaths) {
    const size = await sharp(p).metadata();
    doc.addPage({ size: [size.width, size.height] });
    doc.image(p, 0, 0);
  }
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

async function runCompareJob(
  logLevel, 
  { jobId = uuidv4(), 
    title, 
    aPdf, 
    bPdf, 
    params = {}, 
    progressCb = () => {}, 
    outputDir = null 
  }
) { 
  let lastPageDone = 0;

  // Configura o máximo de vCPU que podem ser utilizadas em paralelo
  const maxCPU = Number(process.env.WORKER_MAX_CPU || 2);
  sharp.concurrency(maxCPU);
  const procLimitFn = pLimit(maxCPU); 

  // Configura nível de log
  setLogLevel(Number(logLevel));
  await log(LOG_DEBUG, 'compare', 'I', `comparacao ${jobId} - '${title}' iniciada.`);
  await log(LOG_DEBUG, 'compare', 'I', `limite de ${maxCPU} paginas em paralelo.`);

  // Inicializa pastas para os arquivos do job de comparação
  const tmpRoot = outputDir || join(tmpdir(), `pats-${jobId}`); 
  const aDir = join(tmpRoot, 'a'); 
  const bDir = join(tmpRoot, 'b'); 
  const outPagesDir = join(tmpRoot, 'pages');
  await ensureDir(aDir);
  await ensureDir(bDir);
  await ensureDir(outPagesDir);

  const OFFSET = params.OFFSET ?? 3;
  const FATSIM = params.FATSIM ?? 0.7;
  const POSFIXA = params.POSFIXA ?? false;
  const MAX_PAGES = params.MAX_PAGES ?? 0;
  const PDF_DPI = Number(process.env.WORKER_PDF_DPI || 96);

  let matches = [];
  let totalPages = 0;
  try {
    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - extraindo textos do PDF 1...`);
    const [textA, normTextA] = await extractTextPerPage(jobId, MAX_PAGES, progressCb, aPdf, '1');

    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - extraindo textos do PDF 2...`);
    const [textB, normTextB] = await extractTextPerPage(jobId, MAX_PAGES, progressCb, bPdf, '2');

    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - processando imagens do PDF 1...`);
    const aImgs = await pdfToPngs(jobId, textA.length, progressCb, aPdf, aDir, 'a', 1, PDF_DPI, maxCPU);

    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - processando imagens do PDF 2...`);
    const bImgs = await pdfToPngs(jobId, textB.length, progressCb, bPdf, bDir, 'b', 2, PDF_DPI, maxCPU);

    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - relacionando paginas...`);
    await progressCb({ jobId, message: 'Relacionando paginas...', done: 0, total: 1 });
    matches = await matchPages(jobId, progressCb, normTextA, normTextB, { OFFSET, FATSIM, POSFIXA, MAX_PAGES });
    totalPages = matches.length;
    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - ${totalPages} paginas. Comparando...`);

    await progressCb({ jobId, message: 'Comparando...', done: 0, total: totalPages, totalPages });

    const processPage = async (i) => {

      const m = matches[i];

      const outDiff = join(outPagesDir, `${i}-diff.png`);

      const outA = join(outPagesDir, `${i}-a.png`);
      const outB = join(outPagesDir, `${i}-b.png`);

      const srcA = m.a !== undefined ? aImgs[m.a] : null;
      const srcB = m.b !== undefined ? bImgs[m.b] : null;

      if (srcA) {
        await sharp(srcA).png().toFile(outA);
      } else {
        await sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 3,
            background: { r: 240, g: 240, b: 240 }
          }
        }).png().toFile(outA);
      }

      if (srcB) {
        await sharp(srcB).png().toFile(outB);
      } else {
        await sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 3,
            background: { r: 240, g: 240, b: 240 }
          }
        }).png().toFile(outB);
      }

      if (m.status === 'inserted') {
        await sharp(outB)
          .flatten({ background: { r: 200, g: 220, b: 255 } })
          .png()
          .toFile(outDiff);
        m.imageSim = 0;
        m.diffPixels = null;
        m.hasImageDiff = true;

      } else if (m.status === 'deleted') {
        await sharp(outA)
          .flatten({ background: { r: 255, g: 200, b: 200 } })
          .png()
          .toFile(outDiff);
        m.imageSim = 0;
        m.diffPixels = null;
        m.hasImageDiff = true;

      } else {
        const imageResult = await makeDiffImage(outA, outB, outDiff);
        m.imageSim = imageResult.imageSimilarity;
        m.diffPixels = imageResult.diffPixels;
        m.hasImageDiff = imageResult.hasImageDiff;
      }

      m.diffText = textDiff(
        m.a !== undefined ? textA[m.a] : '',
        m.b !== undefined ? textB[m.b] : ''
      );

      if (i > lastPageDone) {
        lastPageDone = i;
        if (lastPageDone % 100 === 0 || lastPageDone === totalPages)
          await progressCb({ jobId, message: `Página ${lastPageDone}/${totalPages}`, done: lastPageDone, total: totalPages, preview: true, totalPages });
      }
    };

    let done = 0;
    await Promise.all(
      matches.map((_, i) => procLimitFn(() => processPage(i)))
    );

    // collect diff images (only -diff.png)
    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - coletando diferencas...`);

    const rImgs = readdirSync(outPagesDir)
      .filter(f => f.endsWith('-diff.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(f => join(outPagesDir, f));
    
    const outPdf = join(tmpRoot, 'result.pdf');
    
    await log(LOG_VERBOSE, 'compare', 'I', `comp ${jobId} - gerando PDF com diferencas...`);
    
    await progressCb({ jobId, message: 'Gerando resultados...', done: 0, total: totalPages, totalPages });
    await imagesToPdf(rImgs, outPdf, progressCb);
    
    // ====== Cálculo de page_diffs e text_diffs ======
    let page_diffs = 0;
    let text_diffs = 0;

    for (const m of matches) {
      const hasPageDiff =
        m.status === 'inserted' ||
        m.status === 'deleted' ||
        m.hasImageDiff === true ||
        (m.diffText && m.diffText.some(p => p.type === 'added' || p.type === 'removed'));

      if (hasPageDiff) 
        page_diffs++;

      if (m.diffText && m.diffText.length > 0) 
        text_diffs += m.diffText.filter(p => p.type === 'added' || p.type === 'removed').length;
    }

    return {
      jobId,
      totalPages,
      page_diffs,
      text_diffs,
      matches,
      artifacts: {
        previews: rImgs,
        resultPdf: outPdf,
        workspace: tmpRoot
      }
    };

  } catch (err) {
    // bubble up error after ensuring caller can cleanup or inspect tmp dir
    await log(LOG_NORMAL, 'compare', 'E', `comp ${jobId}: ${String(err)}`);
    throw err;
  } finally {
    await log(LOG_NORMAL, 'compare', 'I', `comparacao finalizada.`);
  }
}

export { runCompareJob };  
