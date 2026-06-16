// app/history/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
type HistoryItem = {
  id: string;
  created_at: string;
  status: string;
  total_pages: number | null;
  error?: string | null;
};
export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/history');
        if (!res.ok) throw new Error('Erro ao carregar histórico');
        const json = (await res.json()) as HistoryItem[];
        setItems(json);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);
  if (loading) return <p>Carregando histórico...</p>;
  return (
    <main className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold">Histórico</h1>
        {items.length === 0 ? (
          <p className="text-sm text-slate-600">
            Nenhuma comparação ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-slate-50 text-xs font-semibold">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Criado em</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Páginas</th>
                  <th className="px-2 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-2 py-2 font-mono">
                      {item.id.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${
                          item.status === 'done'
                            ? 'bg-green-100 text-green-700'
                            : item.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status}
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
                      <Link
                        href={`/result/${item.id}`}
                        className="rounded border px-2 py-1 text-[11px] hover:bg-slate-50"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}