/**
 * PATSCompare
 * /app/[locale]/layout.tsx
 * Main app layout
 * (c) PATS Technologies
 */
import './globals.css';
import {cookies} from 'next/headers';
import {getLocale, getTranslations} from 'next-intl/server';
import { Header } from './header';
import {Locale, NextIntlClientProvider} from 'next-intl';
import LocaleSwitcher from './localeSwitcher';
import { Rajdhani } from 'next/font/google';

const rajdhani = Rajdhani({
  weight: ['500', '700'],
  subsets: ['latin'],
  variable: '--font-rajdhani', // opcional para usar como variável CSS
  display: 'swap'              // recomendado
})

export async function generateMetadata() {
  const t = await getTranslations('RootLayout');
  return {
    title: 'PATS Compare',
    description: 'PDF comparison service',
  };
}

export default async function LocaleLayout({children}: LayoutProps<'/'>) {
  const locale = await getLocale();



  return (
    <html lang={locale}>
      <body className={`${rajdhani.variable} font-sans mx-auto w-[95%] min-h-screen flex flex-col bg-slate-50 text-black`}>
        <NextIntlClientProvider locale={locale}>
          <div className="flex justify-between items-center">
            <Header />
            {/* <LocaleSwitcher changeLocaleAction={changeLocaleAction} /> */}
          </div>
          <main className="flex-1 min-h-0">
              {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
