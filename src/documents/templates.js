// Document layer: turns immutable records (quotes, contracts, estimate versions)
// into printable documents. Output is plain HTML split into blocks so it can be
// paginated in the browser today and handed to a server-side renderer later.
import { CONTRACT_DISCLAIMER } from '../data/contracts.js';
import { CONFIDENCE_LABEL, PRESSURE_LABEL, RISK_LABEL } from '../engine/estimate.js';
import { textOf } from '../engine/versions.js';
import { date, hoursRange, money, moneyRange, monthYear } from '../lib/format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const D = (lang, zh, en) => (lang === 'zh' ? zh : en);
const tx = (o, lang) => esc(textOf(o, lang));

function list(items, lang) {
  if (!items?.length) return `<p class="d-muted">${D(lang, '無', 'None')}</p>`;
  return `<ul class="d-list">${items.map((x) => `<li>${typeof x === 'string' ? esc(x) : tx(x, lang)}</li>`).join('')}</ul>`;
}

function header({ lang, studio, designerName, docTitle, subtitle, meta }) {
  return `<div class="d-head">
    <div class="d-studio">${esc(studio || designerName || 'Scopebook')}${studio && designerName ? `<span>${esc(designerName)}</span>` : ''}</div>
    <h1 class="d-title">${esc(docTitle)}</h1>
    ${subtitle ? `<p class="d-subtitle">${esc(subtitle)}</p>` : ''}
    <dl class="d-meta">${meta.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  </div>`;
}

const section = (title, body) => `<h2 class="d-h2">${esc(title)}</h2>${body}`;

// ---------------------------------------------------------------------------
// Quotes (preliminary, revised, final)

export function quoteDocument(quote, lang, { estimateLabel } = {}) {
  const sym = quote.currencySymbol;
  const isFinal = quote.kind === 'final';
  const kindTitle = {
    preliminary: D(lang, '初步報價', 'Preliminary Quote'),
    revised: D(lang, '修訂報價', 'Revised Quote'),
    final: D(lang, '最終報價', 'Final Quote'),
  }[quote.kind];
  const studio = quote.designer?.studio;
  const clientLine = [quote.client?.company, quote.client?.name].filter(Boolean).join(' ');
  const blocks = [];

  blocks.push(header({
    lang,
    studio,
    designerName: quote.designer?.name,
    docTitle: kindTitle,
    subtitle: quote.projectName,
    meta: [
      [D(lang, '客戶', 'Client'), clientLine],
      [D(lang, '日期', 'Date'), date(quote.createdAt, lang)],
      [D(lang, '版本', 'Version'), quote.estimateNumber ? `Q${quote.number} · ${D(lang, '估價', 'Estimate')} v${quote.estimateNumber}` : estimateLabel || D(lang, '初步估價', 'Preliminary estimate')],
      [D(lang, '有效期限', 'Valid until'), isFinal || quote.kind === 'revised' ? date(quote.validUntil, lang) : null],
    ],
  }));

  if (!isFinal) {
    blocks.push(`<div class="d-callout">${D(lang,
      '這是依目前資訊產生的初步估價，並非最終合約價格。進一步討論後，範圍、時程與費用可能調整。',
      'This is a preliminary estimate based on current information, not a final contractual price. Scope, timeline and fees may change after further discussion.')}</div>`);
  }

  // Price block
  const priceText = isFinal ? money(quote.fixedPrice, sym) : moneyRange(quote.price, sym);
  blocks.push(`<div class="d-figures">
    <div><div class="d-flabel">${isFinal ? D(lang, '專案費用', 'Project fee') : D(lang, '初步費用範圍', 'Preliminary fee range')}</div><div class="d-figure">${esc(priceText)}</div>${quote.developmentFee ? `<div class="d-fnote">${D(lang, '另工程開發', 'Plus development')} ${esc(money(quote.developmentFee, sym))}</div>` : ''}</div>
    <div><div class="d-flabel">${D(lang, '預估工時', 'Estimated effort')}</div><div class="d-figure">${esc(hoursRange(quote.effort))}</div></div>
    <div><div class="d-flabel">${isFinal ? D(lang, '時程', 'Timeline') : D(lang, '信心程度', 'Confidence')}</div><div class="d-figure small">${isFinal ? tx(quote.timelineText, lang) : esc(textOf(CONFIDENCE_LABEL[quote.confidence], lang))}</div></div>
  </div>`);

  if (quote.objectives?.length) blocks.push(section(D(lang, '專案目標', 'Project objectives'), list(quote.objectives, lang)));

  if (!isFinal && quote.understanding?.length) {
    blocks.push(section(D(lang, '目前的理解', 'Current understanding'), `<table class="d-table">${quote.understanding
      .map((u) => `<tr><th>${tx(u.q, lang)}</th><td>${tx(u.a, lang)}</td></tr>`)
      .join('')}</table>`));
  }

  // Scope: one block per function so long scopes paginate cleanly
  blocks.push(`<h2 class="d-h2">${isFinal ? D(lang, '確認範圍', 'Confirmed scope') : D(lang, '建議範圍', 'Suggested scope')}</h2>`);
  for (const s of quote.scope) {
    blocks.push(`<div class="d-scope"><div class="d-scope-name">${tx(s.name, lang)}${s.level ? `<span>${esc(s.level)}</span>` : ''}${s.custom ? `<span>${D(lang, '額外需求', 'Additional')}</span>` : ''}</div>${
      s.included ? `<div class="d-scope-inc">${esc((s.included[lang] || s.included.zh || []).join(lang === 'zh' ? '、' : ', '))}</div>` : s.note ? `<div class="d-scope-inc">${esc(s.note)}</div>` : ''
    }</div>`);
  }
  if (quote.pendingCustom?.length) {
    blocks.push(section(D(lang, '其他需求（待設計師評估）', 'Additional requirements (to be reviewed by the designer)'),
      `${list(quote.pendingCustom.map((c) => (c.note ? `${c.name} — ${c.note}` : c.name)), lang)}<p class="d-muted">${D(lang, '這些需求超出目前的標準估算模型，未計入上述費用。', 'These are outside the standard estimation model and are not included in the fee above.')}</p>`));
  }

  blocks.push(section(D(lang, '交付成果', 'Deliverables'), list(quote.deliverables, lang)));
  blocks.push(`<p class="d-muted">${D(lang, `估價基礎：${quote.counts.functions} 項功能、${quote.counts.flows} 個主要流程、約 ${quote.counts.screens} 個畫面、${quote.counts.states} 種狀態。`, `Based on ${quote.counts.functions} functions, ${quote.counts.flows} main flows, about ${quote.counts.screens} screens and ${quote.counts.states} states.`)}</p>`);

  if (isFinal || quote.kind === 'revised') {
    blocks.push(section(D(lang, '時程與修改', 'Timeline and revisions'), `<table class="d-table">
      <tr><th>${D(lang, '時程', 'Timeline')}</th><td>${tx(quote.timelineText, lang)}</td></tr>
      <tr><th>${D(lang, '修改次數', 'Revision rounds')}</th><td>${D(lang, `每階段 ${quote.revisionRounds} 次`, `${quote.revisionRounds} per phase`)}</td></tr>
    </table>`));
    const fee = quote.fixedPrice ?? quote.price.max;
    blocks.push(section(D(lang, '付款方式', 'Payment terms'), `<table class="d-table">${quote.paymentSchedule
      .map((p) => `<tr><th>${tx(p.label, lang)}</th><td>${p.percent}%${isFinal ? `　${esc(money((fee * p.percent) / 100, sym))}` : ''}</td></tr>`)
      .join('')}<tr><th>${D(lang, '付款期限', 'Due')}</th><td>${D(lang, `請款後 ${quote.paymentDueDays} 日內`, `Within ${quote.paymentDueDays} days of invoice`)}</td></tr></table>`));
  } else {
    const sched = quote.schedule;
    blocks.push(section(D(lang, '時程', 'Timeline'), `<p>${tx(quote.timelineText, lang)}${sched ? `　·　${D(lang, '時程壓力', 'Schedule pressure')}：${esc(textOf(PRESSURE_LABEL[sched], lang))}` : ''}</p>`));
  }

  blocks.push(section(D(lang, '不包含項目', 'Exclusions'), list(quote.exclusions, lang)));
  blocks.push(section(D(lang, '前提假設', 'Assumptions'), list(quote.assumptions, lang)));
  if (!isFinal) {
    blocks.push(section(D(lang, '尚待確認', 'Still to be confirmed'), list(quote.unknowns, lang)));
    blocks.push(section(D(lang, '信心程度', 'Confidence'), `<p><strong>${esc(textOf(CONFIDENCE_LABEL[quote.confidence], lang))}</strong>　${(quote.confidenceReasons || []).map((r) => tx(r, lang)).join(D(lang, '；', '; '))}</p>`));
  }
  if (quote.notes) blocks.push(section(D(lang, '備註', 'Notes'), `<p class="d-pre">${esc(quote.notes)}</p>`));
  if (isFinal) {
    blocks.push(`<p class="d-muted">${D(lang, `本報價有效期限至 ${date(quote.validUntil, lang)}。`, `This quote is valid until ${date(quote.validUntil, lang)}.`)}</p>`);
  } else {
    blocks.push(`<p class="d-muted">${D(lang, '費用依設計師自訂的估算規則計算，並非市場統一價格。', "Fees are calculated with the designer's own estimation rules, not a market standard.")}</p>`);
  }

  const kindName = { preliminary: 'Preliminary-Quote', revised: 'Revised-Quote', final: 'Final-Quote' }[quote.kind];
  return {
    title: `${kindTitle} — ${quote.projectName}`,
    filename: `${quote.projectName} ${kindName}${quote.number ? ` Q${quote.number}` : ''}`,
    footer: `${quote.projectName} · ${kindTitle}${isFinal ? ` · ${monthYear(quote.createdAt, lang)}` : ''}`,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Contracts

export function contractDocument(contract, quote, settings, lang = contract.lang) {
  const blocks = [];
  const L = (zh, en) => D(lang, zh, en);
  blocks.push(header({
    lang,
    studio: settings.designer.studio,
    designerName: settings.designer.name,
    docTitle: L('設計委託合約', 'Design Services Agreement'),
    subtitle: quote.projectName,
    meta: [
      [L('合約版本', 'Contract version'), `C${contract.number}${contract.status === 'final' ? L('（最終）', ' (final)') : contract.locked ? L('（修訂）', ' (revision)') : L('（草稿）', ' (draft)')}`],
      [L('依據報價', 'Based on quote'), `Q${quote.number} · ${date(quote.createdAt, lang)}`],
      [L('日期', 'Date'), date(contract.lockedAt || contract.createdAt, lang)],
    ],
  }));
  if (contract.status !== 'final') {
    blocks.push(`<div class="d-callout">${esc(textOf(CONTRACT_DISCLAIMER, lang))}</div>`);
  }
  contract.sections.forEach((s, i) => {
    const paragraphs = String(s.body || '').split(/\n/);
    blocks.push(`<h2 class="d-h2">${L(`第 ${i + 1} 條　`, `${i + 1}. `)}${esc(s.title)}</h2>${paragraphs[0] ? `<p class="d-p">${esc(paragraphs[0])}</p>` : ''}`);
    for (const p of paragraphs.slice(1)) blocks.push(p.trim() ? `<p class="d-p">${esc(p)}</p>` : '<div class="d-gap"></div>');
  });
  return {
    title: `${L('合約', 'Contract')} C${contract.number} — ${quote.projectName}`,
    filename: `${quote.projectName} ${contract.status === 'final' ? 'Final-Contract' : 'Contract-Draft'} C${contract.number}`,
    footer: `${quote.projectName} · ${L('設計委託合約', 'Design Services Agreement')} C${contract.number}`,
    watermark: contract.status === 'final' ? null : L('草稿', 'DRAFT'),
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Estimate version (designer's internal record)

export function estimateDocument({ project, version, eff, settings, lang }) {
  const sym = version.snapshot.pricing.currencySymbol;
  const L = (zh, en) => D(lang, zh, en);
  const blocks = [];
  const kind = { preliminary: L('初步估價', 'Preliminary estimate'), revised: L('設計師修訂估價', 'Designer revised estimate'), final: L('最終估價', 'Final estimate') }[version.kind];
  blocks.push(header({
    lang,
    studio: settings.designer.studio,
    designerName: settings.designer.name,
    docTitle: `${L('估價', 'Estimate')} v${version.number}`,
    subtitle: `${project.name} · ${kind}`,
    meta: [
      [L('建立', 'Created'), date(version.createdAt, lang)],
      [L('鎖定', 'Locked'), version.lockedAt ? date(version.lockedAt, lang) : L('草稿', 'Draft')],
      [L('內部文件', 'Internal'), L('僅供設計師使用', 'Designer use only')],
    ],
  }));
  if (version.reason) blocks.push(section(L('設計師說明', 'Designer reason'), `<p class="d-pre">${esc(version.reason)}</p>`));
  blocks.push(`<div class="d-figures">
    <div><div class="d-flabel">${L('預估工時', 'Effort')}</div><div class="d-figure">${esc(hoursRange(eff.effort))}</div></div>
    <div><div class="d-flabel">${eff.fixedPrice != null ? L('最終價格', 'Final price') : L('價格', 'Price')}</div><div class="d-figure">${esc(eff.fixedPrice != null ? money(eff.fixedPrice, sym) : moneyRange(eff.price.total, sym))}</div></div>
    <div><div class="d-flabel">${L('風險／信心', 'Risk / confidence')}</div><div class="d-figure small">${esc(textOf(RISK_LABEL[eff.risk], lang))} / ${esc(textOf(CONFIDENCE_LABEL[eff.confidence], lang))}</div></div>
  </div>`);
  blocks.push(`<h2 class="d-h2">${L('系統估算依據', 'System estimate breakdown')}</h2>`);
  for (const line of eff.system.lines) {
    blocks.push(`<div class="d-ledger"><span>${tx(line.label, lang)}${line.note ? `<small>${tx(line.note, lang)}</small>` : ''}</span><i></i><b>${line.hours}h</b></div>`);
  }
  blocks.push(`<div class="d-ledger total"><span>${L('系統估算', 'System estimate')}</span><i></i><b>${eff.system.effort.point}h (${eff.system.effort.min}–${eff.system.effort.max}h)</b></div>`);
  if (eff.overridden.length || eff.fixedPrice != null) {
    const names = {
      effort: L('預估工時', 'Effort'), screens: L('畫面數', 'Screens'), states: L('狀態數', 'States'), risk: L('風險', 'Risk'),
      confidence: L('信心程度', 'Confidence'), schedule: L('時程壓力', 'Schedule pressure'), rate: L('時薪', 'Hourly rate'), price: L('價格範圍', 'Price range'),
    };
    const fmt = (k, v) => (v && typeof v === 'object' ? `${v.min}–${v.max}` : String(v));
    const rows = eff.overridden.map((k) => `<tr><th>${esc(names[k] || k)}</th><td>${esc(fmt(k, version.overrides[k]))}${version.overrideReasons?.[k] ? ` — ${esc(version.overrideReasons[k])}` : ''}</td></tr>`);
    if (eff.fixedPrice != null) rows.push(`<tr><th>${L('最終價格', 'Final price')}</th><td>${esc(money(eff.fixedPrice, sym))}${version.overrideReasons?.fixedPrice ? ` — ${esc(version.overrideReasons.fixedPrice)}` : ''}</td></tr>`);
    blocks.push(section(L('設計師調整', 'Designer overrides'), `<table class="d-table">${rows.join('')}</table>`));
  }
  blocks.push(section(L('前提假設', 'Assumptions'), list(eff.assumptions.map((a) => a.text), lang)));
  blocks.push(section(L('未知項', 'Unknowns'), list(eff.unknowns.map((u) => u.text), lang)));
  return { title: `${L('估價', 'Estimate')} v${version.number} — ${project.name}`, filename: `${project.name} Estimate v${version.number}`, footer: `${project.name} · ${L('估價', 'Estimate')} v${version.number}`, blocks };
}

// ---------------------------------------------------------------------------
// Developer brief (when the client asks for development support)

export function developerBriefDocument({ project, quote, version, settings, lang }) {
  const L = (zh, en) => D(lang, zh, en);
  const a = version.inputs.answers || {};
  const blocks = [];
  blocks.push(header({
    lang,
    studio: settings.designer.studio,
    designerName: settings.designer.name,
    docTitle: L('開發需求說明', 'Developer Brief'),
    subtitle: project.name,
    meta: [[L('日期', 'Date'), date(new Date().toISOString(), lang)], [L('依據', 'Based on'), `${L('估價', 'Estimate')} v${version.number}`]],
  }));
  blocks.push(section(L('專案目標', 'Objectives'), list(quote.objectives, lang)));
  blocks.push(section(L('功能範圍', 'Functional scope'), ''));
  for (const s of quote.scope) {
    blocks.push(`<div class="d-scope"><div class="d-scope-name">${tx(s.name, lang)}${s.level ? `<span>${esc(s.level)}</span>` : ''}</div>${s.included ? `<div class="d-scope-inc">${esc((s.included[lang] || s.included.zh || []).join(lang === 'zh' ? '、' : ', '))}</div>` : ''}</div>`);
  }
  blocks.push(section(L('技術背景', 'Technical context'), `<table class="d-table">${quote.understanding
    .filter((u) => !/完成|finished/i.test(u.q.en))
    .map((u) => `<tr><th>${tx(u.q, lang)}</th><td>${tx(u.a, lang)}</td></tr>`)
    .join('')}${a.integrationsNote ? `<tr><th>${L('串接說明', 'Integration notes')}</th><td>${esc(a.integrationsNote)}</td></tr>` : ''}${a.techNote ? `<tr><th>${L('技術補充', 'Technical notes')}</th><td>${esc(a.techNote)}</td></tr>` : ''}</table>`));
  blocks.push(section(L('設計交付內容', 'Design handoff'), list(quote.deliverables, lang)));
  blocks.push(section(L('時程', 'Timeline'), `<p>${tx(quote.timelineText, lang)}</p>`));
  blocks.push(section(L('開發費用', 'Development fee'), `<p>${quote.developmentFee ? esc(money(quote.developmentFee, quote.currencySymbol)) : L('由設計師與開發團隊另行確認。', 'To be confirmed by the designer with the development team.')}</p>`));
  return { title: `${L('開發需求說明', 'Developer Brief')} — ${project.name}`, filename: `${project.name} Developer Brief`, footer: `${project.name} · ${L('開發需求說明', 'Developer Brief')}`, blocks };
}

// ---------------------------------------------------------------------------
// Decision record (the full reasoning chain)

export function recordDocument({ project, lang, settings, entries }) {
  const L = (zh, en) => D(lang, zh, en);
  const blocks = [];
  blocks.push(header({
    lang,
    studio: settings.designer.studio,
    designerName: settings.designer.name,
    docTitle: L('專案決策紀錄', 'Project Decision Record'),
    subtitle: project.name,
    meta: [[L('客戶', 'Client'), [project.client.company, project.client.name].filter(Boolean).join(' ')], [L('匯出日期', 'Exported'), date(new Date().toISOString(), lang)]],
  }));
  for (const e of entries) {
    blocks.push(`<div class="d-rec"><div class="d-rec-time">${esc(e.time)}</div><div class="d-rec-who">${esc(e.who)}</div><div>${esc(e.text)}</div></div>`);
  }
  return { title: `${L('專案決策紀錄', 'Decision Record')} — ${project.name}`, filename: `${project.name} Decision Record`, footer: `${project.name} · ${L('專案決策紀錄', 'Decision Record')}`, blocks };
}

// ---------------------------------------------------------------------------

export const DOCUMENT_CSS = `
.sbdoc .d-block { display: flow-root; }
.sbdoc { width: 794px; background: #fffdf9; color: #241f19; font-family: 'IBM Plex Sans', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif; font-size: 12.5px; line-height: 1.65; }
.sbdoc * { box-sizing: border-box; }
.sbdoc .d-page { width: 794px; height: 1123px; padding: 64px 72px 72px; position: relative; overflow: hidden; background: #fffdf9; }
.sbdoc .d-foot { position: absolute; left: 72px; right: 72px; bottom: 34px; display: flex; justify-content: space-between; font-size: 10px; color: #8a8073; border-top: 1px solid #e3dccf; padding-top: 8px; }
.sbdoc .d-mark { position: absolute; top: 46%; left: 0; right: 0; text-align: center; font-size: 120px; color: rgba(122, 86, 49, 0.06); transform: rotate(-24deg); font-family: 'Newsreader', 'Noto Serif TC', serif; pointer-events: none; }
.sbdoc .d-head { padding-bottom: 20px; margin-bottom: 22px; border-bottom: 1px solid #241f19; }
.sbdoc .d-studio { font-family: 'Newsreader', 'Noto Serif TC', 'Songti TC', serif; font-size: 15px; display: flex; gap: 10px; align-items: baseline; }
.sbdoc .d-studio span { font-family: inherit; font-size: 11px; color: #7a7064; }
.sbdoc .d-title { font-family: 'Newsreader', 'Noto Serif TC', 'Songti TC', serif; font-weight: 500; font-size: 32px; margin: 26px 0 2px; letter-spacing: -0.01em; }
.sbdoc .d-subtitle { font-family: 'Newsreader', 'Noto Serif TC', 'Songti TC', serif; font-size: 17px; color: #4a4239; margin: 0; }
.sbdoc .d-meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 16px 0 0; }
.sbdoc .d-meta dt { font-size: 10px; color: #7a7064; }
.sbdoc .d-meta dd { margin: 0; font-size: 12px; }
.sbdoc .d-callout { border-left: 2px solid #7a5631; background: #f5ecdd; padding: 10px 14px; margin: 0 0 18px; font-size: 11.5px; color: #4a4239; }
.sbdoc .d-figures { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 18px; padding: 14px 0 18px; border-bottom: 1px solid #ddd4c5; margin-bottom: 8px; }
.sbdoc .d-flabel { font-size: 10.5px; color: #7a7064; }
.sbdoc .d-figure { font-family: 'Newsreader', 'Noto Serif TC', 'Songti TC', serif; font-size: 24px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.sbdoc .d-figure.small { font-size: 16px; padding-top: 5px; }
.sbdoc .d-fnote { font-size: 10.5px; color: #7a7064; }
.sbdoc .d-h2 { font-family: 'Newsreader', 'Noto Serif TC', 'Songti TC', serif; font-weight: 500; font-size: 16px; margin: 22px 0 8px; }
.sbdoc .d-list { margin: 0; padding-left: 18px; }
.sbdoc .d-list li + li { margin-top: 2px; }
.sbdoc .d-table { width: 100%; border-collapse: collapse; }
.sbdoc .d-table th { text-align: left; font-weight: 400; color: #7a7064; width: 38%; padding: 5px 12px 5px 0; vertical-align: top; border-bottom: 1px solid #ece6d9; }
.sbdoc .d-table td { padding: 5px 0; border-bottom: 1px solid #ece6d9; }
.sbdoc .d-scope { padding: 7px 0; border-bottom: 1px solid #ece6d9; }
.sbdoc .d-scope-name { font-weight: 500; display: flex; gap: 10px; align-items: baseline; }
.sbdoc .d-scope-name span { font-size: 10px; color: #7a5631; font-weight: 500; }
.sbdoc .d-scope-inc { font-size: 11.5px; color: #6b6258; }
.sbdoc .d-muted { color: #7a7064; font-size: 11.5px; margin: 8px 0 0; }
.sbdoc .d-p { margin: 0 0 2px; color: #2f2922; }
.sbdoc .d-gap { height: 8px; }
.sbdoc .d-pre { white-space: pre-wrap; margin: 0; }
.sbdoc .d-ledger { display: flex; gap: 8px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid #ece6d9; }
.sbdoc .d-ledger span small { display: block; color: #8a8073; font-size: 10.5px; }
.sbdoc .d-ledger i { flex: 1; border-bottom: 1px dotted #c4b8a4; transform: translateY(-3px); }
.sbdoc .d-ledger b { font-weight: 500; font-variant-numeric: tabular-nums; font-family: 'Newsreader', serif; font-size: 14px; }
.sbdoc .d-ledger.total { border-top: 1px solid #241f19; border-bottom: 0; margin-top: 4px; }
.sbdoc .d-rec { display: grid; grid-template-columns: 110px 70px 1fr; gap: 12px; padding: 5px 0; border-bottom: 1px solid #ece6d9; font-size: 11.5px; }
.sbdoc .d-rec-time, .sbdoc .d-rec-who { color: #7a7064; }
.sbdoc p { margin: 0; }
`;
