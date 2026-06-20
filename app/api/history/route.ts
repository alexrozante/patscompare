/**
 * PATSCompare
 * /app/api/history/route.js
 * API route that returns the comparison table records
 * (c) PATS Technologies
 */
import { NextResponse } from 'next/server';
import { pool } from '../../../server/db';

export async function GET() {
  try {
    //TODO Adicionar suporte para paginacao e futuramente filtros
    const res = await pool.query(
      `
      SELECT
        id,
        title,
        filename_a,
        filename_b,
        created_at,
        status,
        total_pages,
        page_diffs,
        text_diffs,
        error
      FROM comparisons
      ORDER BY created_at DESC
      LIMIT 100
      `
    );

    // Normaliza tipos p/ frontend
    const items = res.rows.map((row: { 
      id: string; 
      title: string;
      filename_a: string;
      filename_b: string;
      created_at: { toISOString: () => any; }; 
      status: string; 
      total_pages: number | null; 
      page_diffs: number | null;
      text_diffs: number | null;
      error: string | null; 
    }) => ({
      id: row.id as string,
      title: row.title as string,
      filename_a: row.filename_a as string,
      filename_b: row.filename_b as string,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      status: row.status as string,
      total_pages: row.total_pages as number | null,
      page_diffs: row.page_diffs as number | 0,
      text_diffs: row.text_diffs as number | 0,
      error: row.error as string | null
    }));

    return NextResponse.json(items);
  } catch (err: any) {
    console.error('GET /api/history error', err);
    return new NextResponse('Erro ao carregar histórico', { status: 500 });
  }
}
