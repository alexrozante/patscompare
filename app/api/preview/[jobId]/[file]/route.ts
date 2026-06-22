/**
 * PATSCompare
 * /app/api/preview/[jobId]/[file]/route.js
 * API route that returns the content of a file read from a disk
 * (c) PATS Technologies
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: any) {
  const { jobId, file } = await context.params;

  // segurança básica: impedir caminho com ../
  const safeFile: string = path.basename(file);
  const jobsRoot: string = path.join(process.cwd(), 'data', 'jobs');
  const filePath: string = path.join(jobsRoot, jobId, 'pages', safeFile);

  if (!fs.existsSync(filePath)) {
    return new NextResponse('not found', { status: 404 });
  }

  const ext: string = path.extname(filePath).toLowerCase();
  const contentType: string =
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    'application/octet-stream';

  const fileBuffer = await fs.promises.readFile(filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
