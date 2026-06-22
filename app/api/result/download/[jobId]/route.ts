import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  
  if (!jobId) {
    console.log(`/result/download - Invalid jobId: ${jobId}`)
    return new NextResponse('not found', { status: 404 });
  }
  
  const jobsRoot = path.join(process.cwd(), 'data', 'jobs');
  const filePath = path.join(jobsRoot, jobId, 'result.pdf');

  if (!fs.existsSync(filePath)) {
    console.log(`File Not Found: ${filePath}`);
    return new NextResponse('not found', { status: 404 });
  }

  const stat = await fs.promises.stat(filePath);
  const fileStream = fs.createReadStream(filePath);

  return new NextResponse(fileStream as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': stat.size.toString(),
      'Content-Disposition': `attachment; filename="diff-${jobId}.pdf"`,
    },
  });
}
