// Locale-aware formatting that works outside React (documents, contracts).

export const LOCALE = { zh: 'zh-TW', en: 'en-US' };

export function money(n, symbol = 'NT$') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${symbol}${Math.round(Number(n)).toLocaleString('en-US')}`;
}

export function moneyShort(n, symbol = 'NT$') {
  const v = Number(n);
  if (Math.abs(v) >= 1000) return `${symbol}${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  return money(v, symbol);
}

export function moneyRange(r, symbol = 'NT$', short = false) {
  if (!r) return '—';
  const f = short ? moneyShort : money;
  if (r.min === r.max) return f(r.min, symbol);
  return `${f(r.min, symbol)} – ${short ? f(r.max, symbol) : Math.round(r.max).toLocaleString('en-US')}`;
}

export function hoursRange(r) {
  if (!r) return '—';
  return r.min === r.max ? `${r.min}h` : `${r.min}–${r.max}h`;
}

export function date(iso, lang = 'zh') {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTime(iso, lang = 'zh') {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(LOCALE[lang], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function monthYear(iso, lang = 'zh') {
  return new Date(iso).toLocaleDateString(LOCALE[lang], { year: 'numeric', month: 'long' });
}

const DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const BIG = ['', '萬', '億'];

/** 175000 → 新台幣壹拾柒萬伍仟元整 (financial numerals used in Taiwanese contracts). */
export function chineseAmount(n, prefix = '新台幣') {
  let v = Math.round(Number(n));
  if (!v) return `${prefix}零元整`;
  const groups = [];
  while (v > 0) {
    groups.push(v % 10000);
    v = Math.floor(v / 10000);
  }
  let out = '';
  for (let g = groups.length - 1; g >= 0; g--) {
    const num = groups[g];
    if (num === 0) {
      if (out && !out.endsWith('零')) out += '零';
      continue;
    }
    let part = '';
    let zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(num / 10 ** i) % 10;
      if (d === 0) {
        if (part) zero = true;
      } else {
        if (zero) part += '零';
        zero = false;
        part += DIGITS[d] + UNITS[i];
      }
    }
    if (out && num < 1000 && !out.endsWith('零')) out += '零';
    out += part + BIG[g];
  }
  return `${prefix}${out.replace(/零+$/, '')}元整`;
}
