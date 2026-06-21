/**
 * PATSCompare
 * /app/result/[jobId]/page.tsx
 * Renders the comparison results data allowing page to page navigation
 * (c) PATS Technologies
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
  title: string;
  created_at: string;
  filename_a: string;
  filename_b: string;
  totalPages: number;
  page_diffs: number;
  text_diffs: number;
  matches: Match[];
};

type PreviewKind = 'a' | 'b' | 'diff';
type ZoomMode = 'percent' | 'width' | 'height';

export default function ResultPage() {
  const t = useTranslations('Result');

  const params = useParams();
  const jobId = params.jobId as string;

  const [data, setData] = useState<ResultResponse | null>(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal de zoom
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomKind, setZoomKind] = useState<PreviewKind>('a');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('percent');
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  // NOVO: controla se a área de texto está expandida (previews ocultos)
  const [textExpanded, setTextExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/result/${jobId}`);
        if (res.ok) {
          const json = (await res.json()) as ResultResponse;
          setData(json);
          setCurrent(0);
          setLoading(false);
        }
      } catch (e) {
        console.log('Error:', String(e));
      }
    }
    load();
  }, [jobId]);

  // ESC fecha modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setZoomOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading && !data) {
    return <p>{t('noResult')}</p>;
  }

  if (loading || !data) {
    return <p>{`${t('loadingResult')}...`}</p>;
  }

  const {
    title,
    created_at,
    filename_a,
    filename_b,
    matches,
    totalPages,
    page_diffs,
    text_diffs,
  } = data;

  const m = matches[current];

  const textSimStr =
    m.textSim !== undefined
      ? `${(m.textSim * 100).toFixed(2).replace('.', ',')}%`
      : '-';

  const imageSimStr =
    m.imageSim !== undefined
      ? `${(m.imageSim * 100).toFixed(2).replace('.', ',')}%`
      : '-';

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

  function openZoom(kind: PreviewKind) {
    setZoomKind(kind);
    setZoomMode('percent');
    setZoomPercent(100);
    setZoomOpen(true);
  }

  const zoomSrc =
    zoomKind === 'a'
      ? `/api/preview/${jobId}/${current}-a.png`
      : zoomKind === 'b'
      ? `/api/preview/${jobId}/${current}-b.png`
      : `/api/preview/${jobId}/${current}-diff.png`;

  let zoomImgStyle: React.CSSProperties = {};
  if (zoomMode === 'percent') {
    zoomImgStyle = { width: `${zoomPercent}%`, height: 'auto' };
  } else if (zoomMode === 'width') {
    zoomImgStyle = { width: '100%', height: 'auto' };
  } else if (zoomMode === 'height') {
    zoomImgStyle = { height: '100%', width: 'auto' };
  }

  return (
    <main className="flex h-full flex-col text-black border-gray-400">
      {/* Painel superior */}
      <section className="mb-4 rounded-lg border bg-white px-4 py-2 shadow-sm text-black">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-xl">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {`${t('PDF1')}: `}
            <span className="font-semibold">{filename_a}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {`${t('PDF2')}: `}
            <span className="font-semibold">{filename_b}</span>
          </span>
        </div>
        <hr className="text-gray-300 mt-2 mb-2" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{`${t('startedAt')}: `}</span>
          <span className="font-semibold">
            {new Date(created_at).toLocaleString()}
          </span>
          <span className="text-gray-300">|</span>
          <span>{`${t('totalPages')}: `}</span>
          <span className="font-semibold">{totalPages}</span>
          <span className="text-gray-300">|</span>
          <span>{`${t('pagesWithDiff')}: `}</span>
          <span className="font-semibold">{page_diffs | 0}</span>
          <span className="text-gray-300">|</span>
          <span>{`${t('textDiffs')}: `}</span>
          <span className="font-semibold">{text_diffs | 0}</span>
        </div>
      </section>

      {/* Painel principal */}
      <section className="mb-2 flex flex-1 flex-col space-y-3 rounded-lg border bg-white p-4 shadow-sm min-h-0">
        {/* Navegação */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setCurrent(0)}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            ⏮
          </button>
          <button
            onClick={() => goPrevDiff()}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            ⏪ Dif
          </button>
          <button
            onClick={() => go(-1)}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            ◀
          </button>
          <span className="mx-2 text-xs">
            {`${t('page')} ${current + 1} / ${matches.length}`}
          </span>
          <button
            onClick={() => go(1)}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            ▶
          </button>
          <button
            onClick={() => goNextDiff()}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            Dif ⏩
          </button>
          <button
            onClick={() => setCurrent(matches.length - 1)}
            className="rounded border px-2 py-1 text-xs bg-amber-600 border-amber-500"
          >
            ⏭
          </button>
          <a
            href={`/api/result/download/${jobId}`}
            className="ml-auto rounded bg-amber-600 border-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400"
          >
            {t('resultPDFDnd')}
          </a>
          <a
            href={`/api/result/report/${jobId}`}
            className="rounded bg-amber-600 border-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400"
          >
            {t('resultReportDnd')}
          </a>
        </div>

        {/* Metadados */}
        <div className="rounded border-gray-400 border bg-slate-50 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 w-full">
            <span className="font-semibold">
              <span className="font-normal">{`${t('status')}:`}</span> {m.status}
            </span>
            <span className="font-semibold">
              <span className="font-normal">{`${t('PDF1')} ${t('page')}:`}</span>{' '}
              {m.a !== undefined ? m.a + 1 : '-'}
            </span>
            <span className="font-semibold">
              <span className="font-normal">{`${t('PDF2')} ${t('page')}:`}</span>{' '}
              {m.b !== undefined ? m.b + 1 : '-'}
            </span>
            <span className="flex-1" />
            <span className="flex items-center gap-1">
              <span className="font-semibold">{`${t('textSimilarity')}:`}</span>
              <span className="inline-block w-16 text-right">
                {textSimStr}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold">{`${t('generalSimilarity')}:`}</span>
              <span className="inline-block w-16 text-right">
                {imageSimStr}
              </span>
            </span>
          </div>
        </div>

        {/* Painel que ocupa toda a área livre */}
        <div className="flex flex-1 flex-col min-h-0 gap-3">
          {/* 3 previews ajustáveis - escondidos quando textExpanded=true */}
          {!textExpanded && (
            <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-3">
              {/* PDF 1 Page preview */}
              <div className="flex min-h-0 flex-col">
                <div className="mb-1 flex items-center text-xs font-medium">
                  <span className="mr-4">{`${t('PDF1')} ${t('page')}:`}</span>
                  <button
                    type="button"
                    onClick={() => openZoom('a')}
                    className="rounded border px-1 text-white text-[12px] bg-amber-600 border-amber-500"
                    title="Zoom"
                  >
                    👁
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto border bg-slate-100">
                  <img
                    src={`/api/preview/${jobId}/${current}-a.png?${Date.now()}`}
                    alt="Página A"
                    className="block w-full"
                  />
                </div>
              </div>

              {/* PDF 2 Page preview */}
              <div className="flex min-h-0 flex-col">
                <div className="mb-1 flex items-center text-xs font-medium">
                  <span className="mr-4">{`${t('PDF2')} ${t('page')}:`}</span>
                  <button
                    type="button"
                    onClick={() => openZoom('b')}
                    className="rounded border px-1 text-white text-[12px] bg-amber-600 border-amber-500"
                    title="Zoom"
                  >
                    👁
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto border bg-slate-100">
                  <img
                    src={`/api/preview/${jobId}/${current}-b.png?${Date.now()}`}
                    alt="Página B"
                    className="block w-full"
                  />
                </div>
              </div>

              {/* Diff preview */}
              <div className="flex min-h-0 flex-col">
                <div className="mb-1 flex items-center text-xs font-medium">
                  <span className="mr-4">{`${t('pageWithDiff')}`}</span>
                  <button
                    type="button"
                    onClick={() => openZoom('diff')}
                    className="rounded border px-1 text-white text-[12px] bg-amber-600 border-amber-500"
                    title="Zoom"
                  >
                    👁
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto border bg-slate-100">
                  <img
                    src={`/api/preview/${jobId}/${current}-diff.png?${Date.now()}`}
                    alt="Diff"
                    className="block w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Diferenças de texto: expansível */}
          <div className={`flex flex-col ${textExpanded ? 'flex-1 min-h-0' : ''}`}>
            <div className="mb-1 flex items-center justify-between text-xs font-medium">
              <span>{t('textDiffs')}</span>
              {/* Ícone para expandir/recolher */}
              <button
                type="button"
                onClick={() => setTextExpanded(prev => !prev)}
                className="rounded border px-1 text-[10px] bg-amber-100 border-amber-400"
                title={textExpanded ? t('view') : t('view')}
              >
                {textExpanded ? '⇲' : '⇱'}
              </button>
            </div>
            <div
              key={current}
              className={`overflow-auto rounded border border-gray-400 bg-slate-50 p-3 text-xs font-mono whitespace-pre-wrap ${
                textExpanded ? 'h-full min-h-0' : 'h-40'
              }`}
            >
              {m.diffText?.map((part, idx) => {
                let cls = 'diff-context';
                let prefix = '';
                if (part.type === 'added') {
                  cls = 'diff-added';
                  prefix = '+ ';
                } else if (part.type === 'removed') {
                  cls = 'diff-removed';
                  prefix = '- ';
                }
                return (
                  <span key={`${current}-${idx}`} className={cls}>
                    {prefix}
                    {part.value}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Modal de zoom */}
      {zoomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative max-h-[95vh] max-w-[95vw] rounded-md bg-white p-3 shadow-lg">
            <p>
              {`${t('pageOf')} ${
                zoomKind.toUpperCase() === 'DIFF' ? 'Diferenças' : zoomKind.toUpperCase()
              }`}
            </p>
            <button
              type="button"
              className="absolute right-2 top-2 rounded px-2 text-xs bg-amber-500 hover:bg-amber-300"
              onClick={() => setZoomOpen(false)}
            >
              x
            </button>

            <div className="mb-2 rounded p-1 flex flex-wrap items-center gap-2 text-xs bg-stone-200">
              <span className="font-semibold">{`${t('zoom')}:`}</span>
              <select
                className="rounded border px-1 py-0.5 bg-white border-stone-400"
                value={zoomMode}
                onChange={e => setZoomMode(e.target.value as ZoomMode)}
              >
                <option value="percent">{`${t('percent')}`}</option>
                <option value="width">{`${t('width')}`}</option>
                <option value="height">{`${t('height')}`}</option>
              </select>

              {zoomMode === 'percent' && (
                <>
                  <select
                    className="rounded border px-1 py-0.5 bg-white border-stone-400"
                    value={zoomPercent}
                    onChange={e =>
                      setZoomPercent(
                        Math.min(
                          500,
                          Math.max(1, Number(e.target.value) || 100)
                        )
                      )
                    }
                  >
                    <option value={100}>100%</option>
                    <option value={75}>75%</option>
                    <option value={50}>50%</option>
                    <option value={25}>25%</option>
                  </select>
                  <span>|</span>
                  <label className="flex items-center gap-1">
                    <span className="text-[11px]">{`${t('custom')}:`}</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={zoomPercent}
                      onChange={e =>
                        setZoomPercent(
                          Math.min(
                            500,
                            Math.max(1, Number(e.target.value) || 100)
                          )
                        )
                      }
                      className="w-12 rounded border px-1 py-0.5 text-right text-xs bg-white border-stone-400"
                    />
                    <span>%</span>
                  </label>
                </>
              )}
              {zoomMode === 'width' && <span>{`(${t('adjustToWidth')})`}</span>}
              {zoomMode === 'height' && <span>{`(${t('adjustToHeight')})`}</span>}
            </div>
            <div className="max-h-[85vh] max-w-[90vw] overflow-auto border bg-slate-100">
              <img
                src={zoomSrc}
                alt="Zoom"
                style={zoomImgStyle}
                className="block"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
