import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

export function Header() {
  const t = useTranslations('Result');
  return (
    <header className="shrink-0 mt-2 mb-2 flex items-center">
      <div className="font-bold text-xl flex items-center mr-8">
        <Image src="/pats.png" alt='PATS Logo' height={55} width={55} style={{ width: '100%', height: 'auto' }} loading="eager"/>
        <span className="ml-2">PATSCompare</span>
      </div>
      <nav className="flex gap-4 text-sm mt-1">
        <Link href='/' className="hover:text-amber-500">{t('newComparison')}</Link>
        <Link href='/history' className="hover:text-amber-500">{t('history')}</Link>
      </nav>
    </header>
  );
}
