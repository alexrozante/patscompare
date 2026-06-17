/**
 * PATSCompare
 * compare.js
 * PDF comparison service
 * (c) PATS Technologies
 */
import PDFDocument from 'pdfkit';
import natural from 'natural';
import sharp from 'sharp';
import util from 'util';
import { diffWordsWithSpace } from 'diff';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import { join } from 'path';
import { pool, log } from './db.js';
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync, createWriteStream } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

const { JaroWinklerDistance } = natural;

async function extractTextPerPage(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    pages.push(text);
  }
  return pages;
}

function normalizeText(text) {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textSimilarity(a, b) {
  a = normalizeText(a);
  b = normalizeText(b);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = JaroWinklerDistance(a, b);
  return distance;
}

function matchPages(textA, textB, { OFFSET, FATSIM, POSFIXA }) {
  const matches = [];
  let j = 0;
  for (let i = 0; i < textA.length; i++) {
    if (POSFIXA) {
      matches.push({ a: i, b: i, status: 'matched', textSim: 1 });
      continue;
    }
    let best = -1;
    let bestScore = 0;
    for (let k = j; k <= Math.min(j + OFFSET, textB.length - 1); k++) {
      const sim = textSimilarity(textA[i], textB[k]);
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
      matches.push({
        a: i,
        b: best,
        status: 'matched',
        textSim: bestScore
      });
      j = best + 1;
    } else {
      matches.push({ a: i, status: 'deleted' });
    }
  }
  while (j < textB.length) {
    matches.push({ b: j, status: 'inserted' });
    j++;
  }
  return matches;
}

function pdfToPngs(pdfPath, outDir, prefix = 'p') {
  return new Promise((resolve, reject) => {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const outPrefix = join(outDir, prefix);
    const proc = spawn('pdftoppm', [
      '-png',
      '-r', '150',
      '-aa', 'no',
      '-aaVector', 'no',
      pdfPath,
      outPrefix
    ]);
    proc.on('close', code => {
      if (code !== 0) 
        return reject(new Error('pdftoppm failed ' + code));
      const files = readdirSync(outDir)
        .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
        .sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
      resolve(files.map(f => join(outDir, f)));
    });
    proc.on('error', reject);
  });
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
  const rawA = await sharp(tmpA)
    .removeAlpha()
    .raw()
    .toBuffer();
  const rawB = await sharp(tmpB)
    .removeAlpha()
    .raw()
    .toBuffer();
  const mask = Buffer.alloc(width * height * 4);
  let diffPixels = 0;
  const threshold = 35;
  for (let i = 0, p = 0; i < rawA.length; i += 3, p += 4) {
    const dr = Math.abs(rawA[i] - rawB[i]);
    const dg = Math.abs(rawA[i + 1] - rawB[i + 1]);
    const db = Math.abs(rawA[i + 2] - rawB[i + 2]);    
    const delta = dr + dg + db;
    if (delta > threshold) {
      diffPixels++;
      mask[p] = 255;      // R
      mask[p + 1] = 0;    // G
      mask[p + 2] = 0;    // B
      mask[p + 3] = 150;  // Alpha
    } else {
      mask[p + 3] = 0;
    }
  }
  const totalPixels = width * height;
  const imageSimilarity = 1 - diffPixels / totalPixels;
  const hasImageDiff = diffPixels > 0;
  if (!hasImageDiff) {
    await sharp(tmpA).toFile(outPath);
  } else {
    const overlay = await sharp(mask, {
      raw: {
        width,
        height,
        channels: 4
      }
    }).png().toBuffer();    
    await sharp(tmpB)
      .composite([{ input: overlay, blend: 'over' }])
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

async function imagesToPdf(imgPaths, outPdfPath) {
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

/**
New signature:
runCompareJob({ jobId, aPdf, bPdf, params = {}, progressCb = () => {}, outputDir })
progressCb({ jobId, done, total, message, preview?, ready?, totalPages })
returns { jobId, totalPages, matches, artifacts: { previews: [paths], resultPdf } } 
*/ 
async function runCompareJob({ jobId = uuidv4(), aPdf, bPdf, params = {}, progressCb = () => {}, outputDir = null }) { 
  const tmpRoot = outputDir || join(tmpdir(), `pats-${jobId}`); 
  const aDir = join(tmpRoot, 'a'); 
  const bDir = join(tmpRoot, 'b'); 
  const outPagesDir = join(tmpRoot, 'pages');

  log('compare', 'I', `comparacao ${jobId} iniciada.`);

  await ensureDir(aDir);
  await ensureDir(bDir);
  await ensureDir(outPagesDir);

  const OFFSET = params.OFFSET ?? 3;
  const FATSIM = params.FATSIM ?? 0.7;
  const POSFIXA = params.POSFIXA ?? false;

  log('worker', 'I', `POSFIXA=${String(POSFIXA)}, OFFSET=${String(OFFSET)}, FATSIM=${String(FATSIM)}`);

  let matches = [];
  let totalPages = 0;
  try {
    progressCb({ jobId, message: 'Extraindo texto...', done: 0, total: 1 });      
    const [textA, textB] = await Promise.all([
      extractTextPerPage(aPdf),
      extractTextPerPage(bPdf)
    ]);
    
    progressCb({ jobId, message: 'Convertendo PDFs...', done: 0, total: 1 });
    const [aImgs, bImgs] = await Promise.all([
      pdfToPngs(aPdf, aDir, 'a'),
      pdfToPngs(bPdf, bDir, 'b')
    ]);

    log('worker', 'I', `comp ${jobId} - relacionando paginas...`);
    matches = matchPages(textA, textB, { OFFSET, FATSIM, POSFIXA });
    totalPages = matches.length;
    log('worker', 'I', `comp ${jobId} - ${totalPages} processadas (relacionamento).`);

    progressCb({ jobId, message: 'Processando páginas...', done: 0, total: totalPages, totalPages });
    let done = 0;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const outDiff = join(outPagesDir, `${i}-diff.png`);
      const outA = join(outPagesDir, `${i}-a.png`);
      const outB = join(outPagesDir, `${i}-b.png`);
      const srcA = m.a !== undefined ? aImgs[m.a] : null;
      const srcB = m.b !== undefined ? bImgs[m.b] : null;
      if (srcA) {
        await sharp(srcA)
        .png().toFile(outA);
      } else {
        await sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 3,
            background: { r: 240, g: 240, b: 240 }
          }
        })
        .png()
        .toFile(outA);
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
        })
        .png()
        .toFile(outB);
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
      done++;
      progressCb({
        jobId,
        done,
        total: totalPages,
        message: `Página ${done}/${totalPages}`,
        preview: true,
        totalPages
      });
    }
    // collect diff images (only -diff.png)
    const rImgs = readdirSync(outPagesDir)
      .filter(f => f.endsWith('-diff.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(f => join(outPagesDir, f));
    const outPdf = join(tmpRoot, 'result.pdf');
    await imagesToPdf(rImgs, outPdf);
    progressCb({ jobId, message: 'Comparacao finalizada.', ready: true, done: totalPages, total: totalPages });
    return {
      jobId,
      totalPages,
      matches,
      artifacts: {
        previews: rImgs,
        resultPdf: outPdf,
        workspace: tmpRoot
      }
    };
  } catch (err) {
    // bubble up error after ensuring caller can cleanup or inspect tmp dir
    log('worker', 'E', `comp ${jobId}: ${String(err)}`);
    throw err;
  }
}

export { runCompareJob };  
