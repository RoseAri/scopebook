// Contract generation from a Final Quote + template + settings.
// Generation copies the template; the template itself is never modified.
import { IP_OPTIONS, PORTFOLIO_OPTIONS } from '../data/contracts.js';
import { chineseAmount, date, money } from '../lib/format.js';
import { textOf } from './versions.js';
import { uid } from '../lib/util.js';

export function fillVariables(text, vars) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => (vars[key] != null ? vars[key] : m));
}

const bullets = (items) => items.map((x) => `• ${x}`).join('\n');

/** Plain values a contract can reference, in the contract's language. */
export function contractVariables({ quote, settings, lang, ip, portfolio, ipText, portfolioText }) {
  const sym = quote.currencySymbol;
  const price = quote.fixedPrice ?? quote.price.max;
  const vars = {
    'client.name': quote.client.name || '',
    'client.company': quote.client.company || '',
    'client.email': quote.client.email || '',
    'designer.name': settings.designer.name || '',
    'designer.studio': settings.designer.studio || '',
    'designer.email': settings.designer.email || '',
    'designer.address': settings.designer.address || '',
    'designer.taxId': settings.designer.taxId || '',
    'project.name': quote.projectName,
    'quote.version': String(quote.number),
    'quote.date': date(quote.createdAt, lang),
    'quote.validUntil': date(quote.validUntil, lang),
    'scope.list': bullets(quote.scope.map((s) => textOf(s.name, lang) + (s.level ? ` (${s.level})` : ''))),
    'deliverables.list': bullets(quote.deliverables.map((d) => textOf(d, lang))),
    timeline: textOf(quote.timelineText, lang),
    revisionRounds: String(quote.revisionRounds),
    price: money(price, sym),
    'price.words': lang === 'zh' ? chineseAmount(price) : money(price, sym),
    'development.fee': quote.developmentFee
      ? lang === 'zh'
        ? `另工程開發費用為 ${money(quote.developmentFee, sym)}。`
        : `Development fees are ${money(quote.developmentFee, sym)}.`
      : '',
    'payment.schedule': bullets(
      quote.paymentSchedule.map((p) => {
        const amount = money((price * p.percent) / 100, sym);
        return lang === 'zh' ? `${textOf(p.label, lang)}：${p.percent}%（${amount}）` : `${textOf(p.label, lang)}: ${p.percent}% (${amount})`;
      }),
    ),
    'payment.dueDays': String(quote.paymentDueDays),
    'exclusions.list': bullets(quote.exclusions.map((x) => textOf(x, lang))),
    'assumptions.list': bullets(quote.assumptions.map((x) => textOf(x, lang))),
    jurisdiction: textOf(settings.jurisdiction, lang),
    date: date(new Date().toISOString(), lang),
  };
  vars['ip.clause'] = fillVariables(ipText ?? textOf(IP_OPTIONS[ip]?.text, lang), vars);
  vars['portfolio.clause'] = fillVariables(portfolioText ?? textOf(PORTFOLIO_OPTIONS[portfolio]?.text, lang), vars);
  return vars;
}

export function generateContractSections({ template, quote, settings, lang, ip, portfolio, confidentiality }) {
  const vars = contractVariables({ quote, settings, lang, ip, portfolio });
  const sections = template.sections
    .filter((s) => s.key !== 'confidentiality' || confidentiality)
    .filter((s) => s.enabled !== false)
    .filter((s) => !(s.key === 'assumptions' && !quote.assumptions.length))
    .map((s) => ({
      id: uid('s'),
      key: s.key,
      title: textOf(s.title, lang),
      body: fillVariables(textOf(s.body, lang), vars).replace(/\n{3,}/g, '\n\n').trim(),
      auto: !!s.auto,
    }));
  return { sections, vars };
}

/** Facts from the Final Quote that the contract must still contain. */
export function quoteFacts(quote, settings, lang) {
  const sym = quote.currencySymbol;
  const price = quote.fixedPrice ?? quote.price.max;
  const L = (zh, en) => (lang === 'zh' ? zh : en);
  return [
    { id: 'client', label: L('委託方名稱', 'Client name'), expected: [quote.client.company || quote.client.name].filter(Boolean) },
    { id: 'project', label: L('專案名稱', 'Project name'), expected: [quote.projectName] },
    { id: 'scope', label: L('專案範圍', 'Scope'), expected: quote.scope.map((s) => textOf(s.name, lang)) },
    { id: 'price', label: L('費用', 'Price'), expected: [money(price, sym)] },
    { id: 'payment', label: L('付款方式', 'Payment terms'), expected: quote.paymentSchedule.map((p) => `${p.percent}%`) },
    { id: 'timeline', label: L('時程', 'Timeline'), expected: [textOf(quote.timelineText, lang)] },
    { id: 'revisions', label: L('修改次數', 'Revision policy'), expected: [String(quote.revisionRounds)] },
    { id: 'exclusions', label: L('不包含項目', 'Exclusions'), expected: quote.exclusions.map((x) => textOf(x, lang)) },
  ];
}

export function contractText(contract) {
  return contract.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
}
