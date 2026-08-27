import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import zhCommon from './locales/zh/common.json';

const resources = {
  en: {
    common: enCommon,
  },
  zh: {
    common: zhCommon,
  },
} as const;

function getInitialLanguage(): string {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const stored = window.localStorage.getItem('i18n_language');
  if (stored) {
    return stored;
  }

  const browserLang = window.navigator.language || window.navigator.languages?.[0];
  if (browserLang?.toLowerCase().startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;

