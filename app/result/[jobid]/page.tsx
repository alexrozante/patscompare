// app/result/[jobId]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
type DiffPart = {
  type: 'added' | 'removed' | 'context';
  value: string;
};
type Match = {
  status: string;
  a?: number;
  b?: number;
  imageSim?: number;
  textSim?: number;
  hasImageDiff?: boolean;
  diffText?: DiffPart[];
};
type ResultResponse = {
  totalPages: number;
  matches: Match[];
};
export default function ResultPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [data, setData] = useState<ResultResponse | null>(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/result/${jobId}`);
        if (!res.ok) throw new Error('Erro ao carregar resultado');
        const json = (await res.json()) as ResultResponse;
        setData(json);
        setCurrent(0);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);
  if (loading || !data) {
    return <p>Carregando resultado...</p>;
  }
  const { matches, totalPages } = data;
  const m = matches[current];
  const diffPagesCount = matches.filter(
    p => p.status === 'inserted' || p.status === 'deleted' || p.hasImageDiff
  ).length;
  const textSimStr =
    m.textSim !== undefined ? `${(m.textSim * 100).toFixed(2)}%` : '-';
  const imageSimStr =
    m.imageSim !== undefined ? `${(m.imageSim * 100).toFixed(2)}%` : '-';
  function go(delta: number) {
    setCurrent(prev => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next >= matches.length) return matches.length - 1;
      return next;
    });
  }
  function pageHasDiff(page: Match) {
    return (
      page.status === 'inserted' ||
      page.status === 'deleted' ||
      page.hasImageDiff
    );
  }
  function goNextDiff() {
    for (let i = current + 1; i < matches.length; i++) {
      if (pageHasDiff(matches[i])) {
        setCurrent(i);
        return;
      }
    }
  }
  function goPrevDiff() {
    for (let i = current - 1; i >= 0; i--) {
      if (pageHasDiff(matches[i])) {
        setCurrent(i);
        return;
      }
    }
  }
  return (
    <main className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold">Resultado</h1>
        <p className="text-sm text-slate-700">
          Job: <span className="font-mono">{jobId}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <div>Total de páginas: {totalPages}</div>
          <div>Páginas com diferenças: {diffPagesCount}</div>
        </div>
      </section>
      <section className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        {/* Navegação */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setCurrent(0)}
            className="rounded border px-2 py-1 text-xs"
          >
            ⏮
          </button>
          <button
            onClick={() => goPrevDiff()}
            className="rounded border px-2 py-1 text-xs"
          >
            ⏪ Dif
          </button>
          <button
            onClick={() => go(-1)}
            className="rounded border px-2 py-1 text-xs"
          >
            ◀
          </button>
          <span className="mx-2 text-xs">
            Página {current + 1} / {matches.length}
          </span>
          <button
            onClick={() => go(1)}
            className="rounded border px-2 py-1 text-xs"
          >
            ▶
          </button>
          <button
            onClick={() => goNextDiff()}
            className="rounded border px-2 py-1 text-xs"
          >
            Dif ⏩
          </button>
          <button
            onClick={() => setCurrent(matches.length - 1)}
            className="rounded border px-2 py-1 text-xs"
          >
            ⏭
          </button>
          <a
            href={`/download/${jobId}`}
            className="ml-auto rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Baixar PDF dif
          </a>
        </div>
        {/* Metadados */}
        <div className="rounded border bg-slate-50 p-3 text-xs space-y-1">
          <div>
            <span className="font-semibold">Status:</span> {m.status}
          </div>
          <div>
            <span className="font-semibold">Página A:</span>{' '}
            {m.a !== undefined ? m.a + 1 : '-'}
          </div>
          <div>
            <span className="font-semibold">Página B:</span>{' '}
            {m.b !== undefined ? m.b + 1 : '-'}
          </div>
          <div>
            <span className="font-semibold">Similaridade texto:</span>{' '}
            {textSimStr}
          </div>
          <div>
            <span className="font-semibold">Similaridade imagem:</span>{' '}
            {imageSimStr}
          </div>
        </div>
        {/* Área de preview */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs font-medium">Página A</div>
            <div className="h-80 overflow-auto border bg-slate-100">
              <img
                src={`/preview/${jobId}/${current}-a.png?${Date.now()}`}
                alt="Página A"
                className="block w-full"
              />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">Página B</div>
            <div className="h-80 overflow-auto border bg-slate-100">
              <img
                src={`/preview/${jobId}/${current}-b.png?${Date.now()}`}
                alt="Página B"
                className="block w-full"
              />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">Diferenças</div>
            <div className="h-80 overflow-auto border bg-slate-100">
              <img
                src={`/preview/${jobId}/${current}-diff.png?${Date.now()}`}
                alt="Diff"
                className="block w-full"
              />
            </div>
          </div>
        </div>
        {/* Texto diff */}
        <div>
          <div className="mb-1 text-xs font-medium">Diferenças de texto</div>
          <div className="max-h-64 overflow-auto rounded border bg-slate-50 p-3 text-xs font-mono">
            {m.diffText?.map((part, idx) => {
              let cls = 'diff-context';
              if (part.type === 'added') cls = 'diff-added';
              else if (part.type === 'removed') cls = 'diff-removed';
              return (
                <span key={idx} className={cls}>
                  {part.value}
                </span>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}