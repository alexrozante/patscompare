/**
 * PATSCompare
 * /app/api/result/report/[jobId]/route.ts
 * Returns a JSON report with text differences by page
 * (c) PATS Technologies
 */
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../../../server/db';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = await params;

  try {
    const res = await pool.query(
      `
      SELECT title, matches
        FROM comparisons
       WHERE id = $1
      `,
      [jobId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 }
      );
    }

    const title = res.rows[0].title || '';
    const matches = res.rows[0].matches as any[] | null;
    if (!Array.isArray(matches)) {
      return NextResponse.json(
        { error: 'Matches inválidos' },
        { status: 500 }
      );
    }

    // Monta relatório só com diferenças de texto por página
    const report = matches.map((m, idx) => {
      const diffText = Array.isArray(m.diffText) ? m.diffText : [];

      const textChanges = diffText.filter(
        (p: any) => p.type === 'added' || p.type === 'removed'
      );

      return {
        index: idx,
        status: m.status,
        pageA: m.a !== undefined ? m.a + 1 : null,
        pageB: m.b !== undefined ? m.b + 1 : null,
        textSimilarity: m.textSim ?? null,
        hasTextDiffs: textChanges.length > 0,
        textDiffs: textChanges
      };
    });

    const json = JSON.stringify(
      {
        jobId,
        title,
        generatedAt: new Date().toISOString(),
        pages: report
      },
      null,
      2
    );

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${jobId}.json"`
      }
    });
  } catch (err: any) {
    console.error('GET /api/result/report error', err);
    return new NextResponse('Erro ao gerar relatório', { status: 500 });
  }
}
