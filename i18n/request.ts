import {getRequestConfig} from 'next-intl/server';
import {headers} from 'next/headers';
import pt from '@/messages/pt.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

const messages = { pt, en, es };

export default getRequestConfig(async (params) => {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') || '';
  
  // Resolve locale: params > browser language > default 'en'
  let locale = params.locale;
  
  if (!locale) {
    // Extract primary language from Accept-Language header (e.g., 'pt-BR' -> 'pt')
    const browserLang = acceptLanguage.split(',')[0].split('-')[0].toLowerCase();
    if (['pt', 'es'].includes(browserLang)) {
      locale = browserLang;
    } else {
      locale = 'en';
    }
  }
  
  const msgs = messages[locale as keyof typeof messages] || messages.en;
  return {
    locale,
    messages: msgs
  };
});
