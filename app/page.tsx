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
import { useTranslations } from 'next-intl';

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
  const [title, setTitle] = useState('');
  const [offset, setOffset] = useState(3);
  const [fatSim, setFatSim] = useState(70);
  const [posfixa, setPosfixa] = useState(true);
  const [maxPages, setMaxPages] = useState(0);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const EXEC_MODE = (process.env.NEXT_PUBLIC_MODE || 'production').toLowerCase();

  const SOCKET_HOST = process.env.NEXT_PUBLIC_SOCKET_HOST || '';
  const SOCKET_PORT = process.env.NEXT_PUBLIC_SOCKET_PORT || '';

  const t = useTranslations('Result');
  
  // inicializa socket e listener de progresso
  useEffect(() => {
   if (!socket) {
      if (EXEC_MODE === 'production') {
        // Em produção há um serviço NginX que redireciona /socket.io para / então SOCKET_HOST e SOCKET_PORT não deve ser utilizados.
        socket = io('/', {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
        });
      } else {
        // Em dev a conexão deve ser realizada com URL e porta do servidor e para /socket.io pois não há proxy tratando a request.
        const socketUrl = `http://${SOCKET_HOST}:${SOCKET_PORT}`;
        console.log(`Compare - Socket connection = ${socketUrl}`);
        socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
        });
      }
    }
    const handleConnect = () => {
      console.log(`[socket] connected`);
    };

    const handleConnectError = (err: any) => {
      console.error('[socket] connect error', err);
    };

    const handleDisconnect = (reason: string) => {
      console.warn('[socket] disconnected', reason);
    };

    const handler = (data: ProgressEvent) => {
      let newMessage = data.message;
      if (newMessage) {
        if (newMessage.startsWith('##')) {
          data.message = newMessage.substring(2);
        } else {
          data.message = t(newMessage);
        }
      }
      setProgress(prev => ({ ...(prev || {}), ...data }));
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('progress', handler);

    return () => {
      socket?.off('progress', handler);
      socket?.off('connect', handleConnect);
      socket?.off('connect_error', handleConnectError);
      socket?.off('disconnect', handleDisconnect);
    };
  }, [SOCKET_PORT]);

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
      setErrorMsg(t('selectPDFs'));
      return;
    }

    if (maxPages < 0 || maxPages > 9_999_999) {
      setErrorMsg(t('maxPagesLimits'));
      return;
    }

    setIsSubmitting(true);
    setProgress(null);
    setJobId(null);

    try {
      const fd = new FormData();
      fd.append('title', title);
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
        throw new Error(text || t('errorCompInit'));
      }

      const json = await res.json();
      const id = json.jobId as string;
      setJobId(id);

      if (socket) 
        socket.emit('join', id);

    } catch (err: any) {
      setErrorMsg(err.message || t('errorSending'));
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
      <section className="rounded-lg border border-gray-400 bg-white p-4 shadow-sm text-black">
        <h1 className="mb-4 text-lg font-semibold">{t('newComparison')}</h1>

        <form className="space-y-2" onSubmit={onSubmit}>
          <div className="grid">
            <label className="w-full text-sm font-medium mb-1">{t('title')}</label>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={e => setTitle(e.target.value || '')}
              className="w-200 rounded-md border border-gray-400 px-2 py-1 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">{t('PDF1')}</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFileA(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-md file:px-3 file:py-2 file:border-0 file:bg-amber-500 file:hover:bg-amber-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('PDF2')}</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFileB(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:rounded-md file:px-3 file:py-2 file:border-0 file:bg-amber-500 file:hover:bg-amber-400"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('maxPagesComp')}
            </label>
            <input
              type="number"
              min={0}
              max={9_999_999}
              value={maxPages}
              onChange={e => setMaxPages(Number(e.target.value || 0))}
              className="w-30 rounded-md border border-gray-400 px-2 py-1 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">{`0 = ${t('allPages')}.`}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-end col-span-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={posfixa}
                  onChange={e => setPosfixa(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                {t('strictPosComp')}
              </label>
            </div>
            {!posfixa && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('maxPageOffset')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={offset}
                  onChange={e => setOffset(Number(e.target.value))}
                  className="w-50 rounded-md border border-gray-400 px-2 py-1 text-sm"
                />
              </div>
            )}
            {!posfixa && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {`${t('minSimilarity')} (%)`}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={fatSim}
                  onChange={e => setFatSim(Number(e.target.value))}
                  className="w-50 rounded-md border border-gray-400 px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={!canCompare}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {isSubmitting ? `${t('comparing')}...` : t('compare')}
          </button>
        </form>
      </section>
      {jobId && (
        <section className="rounded-lg border bg-white p-4 shadow-sm text-black">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Job: {jobId}</span>
            <span className="text-xs text-slate-600">
              {progress?.message || t('waitingProgress')}
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
