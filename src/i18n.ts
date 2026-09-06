import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import nl from './locales/nl.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

const messages = {
  en,
  nl,
  fr,
  es,
};

const browserLang = (typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en').split('-')[0];
const initialLocale = ['en', 'nl', 'fr', 'es'].includes(browserLang) ? browserLang : 'en';

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages,
});

export function setAppLocale(locale: string) {
  const langKey = locale.split('-')[0].toLowerCase();
  if (['en', 'nl', 'fr', 'es'].includes(langKey)) {
    (i18n.global.locale as any).value = langKey;
  } else {
    (i18n.global.locale as any).value = 'en';
  }
}
