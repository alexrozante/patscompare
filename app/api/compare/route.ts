/**
 * PATSCompare
 * /app/api/compare/route.js
 * API route that starts a two PDF comparison task
 * (c) PATS Technologies
 */
import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

async function saveFileFromForm(file: File, prefix: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'data', 'uploads');
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name) || '.pdf';
  const destPath = path.join(uploadDir, `${prefix}-${uuidv4()}${ext}`);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(destPath, buffer);

  return destPath;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const fileA = formData.get('a') as File | null;
    const fileB = formData.get('b') as File | null;

    if (!fileA || !fileB) {
      return NextResponse.json({ error: 'Envie dois PDFs' }, { status: 400 });
    }

    const aPath = await saveFileFromForm(fileA, 'a');
    const bPath = await saveFileFromForm(fileB, 'b');

    const jobId = uuidv4();

    const OFFSET = Number(formData.get('OFFSET') ?? 3);

    const FATSIM = Number(formData.get('FATSIM') ?? 0.7);

    const POSFIXA_RAW = formData.get('POSFIXA');
    const POSFIXA =
      POSFIXA_RAW === 'true' ||
      POSFIXA_RAW === 'on' ||
      POSFIXA_RAW === '1';

    const MAX_PAGES = Number(formData.get('MAX_PAGES') ?? 0);

    const params = { OFFSET, FATSIM, POSFIXA, MAX_PAGES };

    const queue = new Queue('compare-queue', {
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    });

    await queue.add(
      'compare',
      { jobId, aPath, bPath, params },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return NextResponse.json({ jobId });
  } catch (err: any) {
    console.error('POST /api/compare error', err);
    return NextResponse.json(
      { error: 'Erro ao iniciar comparação' },
      { status: 500 },
    );
  }
}
