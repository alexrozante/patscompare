/**
 * PATSCompare
 * /app/page.tsx
 * Renders the home page
 * (c) PATS Technologies
 */
'use client';

import { FormEvent, useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';

let socket: Socket | null = null;

type ProgressEvent = {
  jobId?: string;
  done?: number;
  total?: number;
  message?: string;
  ready?: boolean;
  error?: boolean;
};

export default function HomePage() {
  const router = useRouter();

  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [offset, setOffset] = useState(3);
  const [fatSim, setFatSim] = useState(70);
  const [posfixa, setPosfixa] = useState(true);
  const [maxPages, setMaxPages] = useState(0);

  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const SOCKET_HOST = process.env.NEXT_PUBLIC_SOCKET_HOST || '127.0.0.1';
  const SOCKET_PORT = process.env.NEXT_PUBLIC_SOCKET_PORT || '5001';

  // inicializa socket e listener de progresso
  useEffect(() => {
    if (!socket) {
      socket = io(`http://${SOCKET_HOST}:${SOCKET_PORT}`);
    }

    const handler = (data: ProgressEvent) => {
      console.log('socket progress:', data);
      setProgress(prev => ({ ...(prev || {}), ...data }));
    };

    socket.on('progress', handler);

    return () => {
      socket?.off('progress', handler);
    };
  }, [SOCKET_HOST, SOCKET_PORT]);

  // redireciona quando receber ready=true
  useEffect(() => {
    if (progress?.ready && jobId) {
      setIsSubmitting(false);
      router.push(`/result/${jobId}`);
    }
  }, [progress, jobId, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    if (!fileA || !fileB) {
      setErrorMsg('Selecione os dois PDFs.');
      return;
    }

    if (maxPages < 0 || maxPages > 9_999_999) {
      setErrorMsg('Máximo de páginas deve estar entre 0 e 9.999.999.');
      return;
    }

    setIsSubmitting(true);
    setProgress(null);
    setJobId(null);

    try {
      const fd = new FormData();
      fd.append('a', fileA);
      fd.append('b', fileB);
      fd.append('OFFSET', String(offset));
      fd.append('FATSIM', String(fatSim / 100));
      fd.append('POSFIXA', String(posfixa));
      fd.append('MAX_PAGES', String(maxPages));

      const res = await fetch('/api/compare', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Erro ao iniciar comparação');
      }

      const json = await res.json();
      const id = json.jobId as string;
      setJobId(id);

      if (socket) {
        socket.emit('join', id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao enviar');
      setIsSubmitting(false);
    }
  }

  // calcula o percentual, caindo para 100% se ready=true
  const pct = (() => {
    if (progress?.ready) return 100;
    if (progress && progress.total && progress.done != null) {
      return Math.round((100 * progress.done) / progress.total);
    }
    return 0;
  })();

  const canCompare = !!fileA && !!fileB && !isSubmitting;

  return (
    <main className="space-y-6">
      <section className="rounded-lg border bg-white p-4 shadow-sm text-black">
        <h1 className="mb-4 text-lg font-semibold">Nova comparação</h1>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">PDF A</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFileA(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">PDF B</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFileB(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-end col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={posfixa}
                  onChange={e => setPosfixa(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                Apenas páginas na mesma posição
              </label>
            </div>

            {!posfixa && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Máx. Págs. Inseridas/Excluídas
                </label>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={offset}
                  onChange={e => setOffset(Number(e.target.value))}
                  className="w-full rounded-md border px-2 py-1 text-sm"
                />
              </div>
            )}

            {!posfixa && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Similaridade mínima (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={fatSim}
                  onChange={e => setFatSim(Number(e.target.value))}
                  className="w-full rounded-md border px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Máximo de páginas a comparar
            </label>
            <input
              type="number"
              min={0}
              max={9_999_999}
              value={maxPages}
              onChange={e => setMaxPages(Number(e.target.value || 0))}
              className="w-full rounded-md border px-2 py-1 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">0 = todas as páginas.</p>
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={!canCompare}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Comparando...' : 'Comparar'}
          </button>
        </form>
      </section>

      {jobId && (
        <section className="rounded-lg border bg-white p-4 shadow-sm text-black">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Job: {jobId}</span>
            <span className="text-xs text-slate-600">
              {progress?.message || 'Aguardando progresso...'}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-slate-600">
            {pct}%
          </div>
        </section>
      )}
    </main>
  );
}
