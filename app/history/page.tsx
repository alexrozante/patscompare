/**
 * PATSCompare
 * /app/history/page.tsx
 * Renders the comparison results table page
 * (c) PATS Technologies
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type HistoryItem = {
  id: string;
  title: string;
  created_at: string;
  filename_a: string;
  filename_b: string;
  status: string;
  total_pages: number | null;
  page_diffs: number | null;
  text_diffs: number | null;
  elapsed_time: string;
  error?: string | null;
};

type HistoryResponse = {
  items: HistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export default function HistoryPage() {
  const t = useTranslations('Result');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/history?page=${page}&pageSize=20`);
        if (!res.ok) throw new Error(t('errorLoadingHistory'));
        const json = (await res.json()) as HistoryResponse;
        if (!cancelled) {
          setItems(json.items);
          setHasMore(json.hasMore);
        }
      } finally {
        if (!cancelled) 
          setLoading(false);
      }
    }
    // primeira carga imediata
    load();
    // auto-refresh a cada 10s
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [page, t]);

  if (loading && items.length === 0) {
    return <p>{`${t('loadingHistory')}...`}</p>;
  }

  return (
    <main className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm text-black">
        <h1 className="mb-2 text-lg font-semibold">{t('history')}</h1>

        {items.length === 0 ? (
          <p className="text-sm text-stone-600">{t('noHistory')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-stone-200 text-xs font-semibold">
                  <tr>
                    <th className="px-2 py-2 w-40">{t('startedAt')}</th>
                    <th className="px-2 py-2 w-80">{t('tcolTitle')}</th>
                    <th className="px-2 py-2 w-80">{t('PDF1')}</th>
                    <th className="px-2 py-2 w-80">{t('PDF2')}</th>
                    <th className="px-2 py-2 w-30">{t('status')}</th>
                    <th className="px-2 py-2 w-20">{t('pages')}</th>
                    <th className="px-2 py-2 w-20">{t('tcolDiffPages')}</th>
                    <th className="px-2 py-2 w-20">{t('tcolDiffTexts')}</th>
                    <th className="px-2 py-2 w-40">{t('elapsedTime')}</th>
                    <th className="px-2 py-2">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-2 py-2 text-stone-700">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {item.title || ''}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {item.filename_a}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {item.filename_b}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${
                            item.status === 'done'
                              ? 'bg-green-100 text-green-700'
                              : item.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {t(item.status) || item.status}
                        </span>
                        {item.status === 'failed' && item.error && (
                          <div className="mt-1 text-[10px] text-red-600 truncate max-w-xs">
                            {item.error}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {item.total_pages ?? '-'}
                      </td>
                      <td className="px-2 py-2">
                        {item.page_diffs ?? '-'}
                      </td>
                      <td className="px-2 py-2">
                        {item.text_diffs ?? '-'}
                      </td>
                      <td className="px-2 py-2 text-stone-700">
                        {item.elapsed_time}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/result/${item.id}`}
                          className="rounded border px-2 py-1 text-white text-[12px] bg-amber-600 border-amber-500 hover:bg-amber-400"
                          title={t('view')}
                        >
                          👁
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Navegação de páginas */}
            <div className="flex items-center justify-between text-xs mt-3 bg-stone-100 border-t-stone-400 border-t py-2">
              {page === 1 && <p>&nbsp;</p>}
              {page > 1 && 
              <button
                className="rounded border px-2 py-1 disabled:opacity-50 text-white text-[12px] bg-amber-600 border-amber-500"
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ◀ {t('page')} {page - 1}
              </button>
              }
              <span>{`${t('page')} ${page}`}</span>
              {!hasMore && <p>&nbsp;</p>}
              {hasMore &&
              <button
                className="rounded border px-2 py-1 disabled:opacity-50 text-white text-[12px] bg-amber-600 border-amber-500"
                onClick={() => setPage(p => p + 1)}
              >
                {t('page')} {page + 1} ▶
              </button>
              }
            </div>
          </>
        )}
      </section>
    </main>
  );
}
