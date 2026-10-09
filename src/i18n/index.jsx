import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS } from './strings.js';
import { storage } from '../store/storage.js';
import * as fmt from '../lib/format.js';

// Language codes: 'zh' (繁體中文, default) and 'en'.
export const LANGS = [
  { id: 'zh', label: '繁中' },
  { id: 'en', label: 'EN' },
];

const I18nContext = createContext(null);

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
}

export function translate(lang, key, params) {
  const entry = STRINGS[key];
  if (!entry) {
    if (import.meta.env?.DEV) console.warn('Missing string', key);
    return key;
  }
  return interpolate(entry[lang] ?? entry.zh, params);
}

export function I18nProvider({ children, currencySymbol = 'NT$' }) {
  const [lang, setLangState] = useState(() => {
    const saved = storage.loadLang();
    return saved === 'en' || saved === 'zh' ? saved : 'zh';
  });

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    storage.saveLang(next);
  }, []);

  const value = useMemo(() => {
    const t = (key, params) => translate(lang, key, params);
    const tl = (obj, params) => {
      if (obj == null) return '';
      if (typeof obj === 'string') return obj;
      return interpolate(obj[lang] ?? obj.zh ?? obj.en ?? '', params);
    };
    return {
      lang,
      setLang,
      t,
      tl,
      money: (n) => fmt.money(n, currencySymbol),
      moneyRange: (r, short) => fmt.moneyRange(r, currencySymbol, short),
      date: (iso) => fmt.date(iso, lang),
      dateTime: (iso) => fmt.dateTime(iso, lang),
      currencySymbol,
    };
  }, [lang, setLang, currencySymbol]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
