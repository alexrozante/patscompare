// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'PATS Compare',
  description: 'PDF comparison service',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <div className="font-bold text-xl">PATS Compare</div>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="hover:underline">
                Nova comparação
              </a>
              <a href="/history" className="hover:underline">
                Histórico
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}