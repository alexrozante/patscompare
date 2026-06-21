/**
 * PATSCompare
 * /app/api/history/route.ts
 * API route that returns the comparison table records
 * (c) PATS Technologies
 */
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    const res = await pool.query(
      `
      SELECT
        id,
        title,
        created_at,
        TO_CHAR(updated_at - created_at, 'HH24:MI:SS') AS elapsed_time,
        filename_a,
        filename_b,
        status,
        total_pages,
        page_diffs,
        text_diffs,
        error
      FROM comparisons
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [pageSize, offset]
    );

    const items = res.rows.map((row: any) => ({
      id: row.id as string,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      elapsed_time: row.elapsed_time as string,
      title: row.title as string,
      filename_a: row.filename_a as string,
      filename_b: row.filename_b as string,
      status: row.status as string,
      total_pages: row.total_pages as number | null,
      page_diffs: (row.page_diffs as number | null) ?? 0,
      text_diffs: (row.text_diffs as number | null) ?? 0,
      error: row.error as string | null
    }));

    // hasMore simples: se veio pageSize itens, assumimos que pode haver mais
    const hasMore = items.length === pageSize;

    return NextResponse.json({
      items,
      page,
      pageSize,
      hasMore
    });
  } catch (err: any) {
    console.error('GET /api/history error', err);
    return new NextResponse('Erro ao carregar histórico', { status: 500 });
  }
}
