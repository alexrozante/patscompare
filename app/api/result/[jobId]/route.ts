/**
 * PATSCompare
 * /app/api/result/[jobId]/route.js
 * API route that returns a JSON comparison results object
 * (c) PATS Technologies
 */
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../../server/db';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = (await params).jobId;
  try {
    const res = await pool.query(
      `
      SELECT
        id,
        created_at,
        title,
        filename_a,
        filename_b,
        status,
        total_pages,
        page_diffs,
        text_diffs,
        matches
      FROM comparisons
      WHERE id = $1
      `,
      [jobId],
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 },
      );
    }

    const row = res.rows[0];
    // matches está armazenado como JSONB no Postgres
    const matches = row.matches || [];

    return NextResponse.json({
      jobId: row.id,
      title: row.title,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      filename_a: row.filename_a,
      filename_b: row.filename_b,
      status: row.status,
      totalPages: row.total_pages,
      page_diffs: row.page_diffs,
      text_diffs: row.text_diffs,
      matches,
    });
  } catch (err: any) {
    console.error('GET /api/result error', err);
    return NextResponse.json(
      { error: 'Erro ao carregar resultado' },
      { status: 500 },
    );
  }
}
