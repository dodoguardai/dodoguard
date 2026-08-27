import React from 'react';
import { useTranslation } from 'react-i18next';

import '../../i18n';

const LANGUAGES: Array<{ code: 'en' | 'zh'; labelKey: 'language.switchToEnglish' | 'language.switchToChinese' }> =
  [
    { code: 'en', labelKey: 'language.switchToEnglish' },
    { code: 'zh', labelKey: 'language.switchToChinese' },
  ];

export default function LanguageSwitcher(): JSX.Element {
  const { i18n, t } = useTranslation();

  const current = (i18n.language || i18n.resolvedLanguage || 'en') as 'en' | 'zh';

  const handleChange = (code: 'en' | 'zh') => {
    void i18n.changeLanguage(code);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('i18n_language', code);
    }
  };

  return (
    <div className="navbar__item">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => handleChange(lang.code)}
          className="button button--sm button--link"
          style={{
            fontWeight: current === lang.code ? 600 : 400,
            opacity: current === lang.code ? 1 : 0.6,
            paddingInline: 6,
          }}
          aria-current={current === lang.code ? 'true' : undefined}
        >
          {t(lang.labelKey)}
        </button>
      ))}
    </div>
  );
}

