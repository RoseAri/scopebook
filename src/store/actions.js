// Designer workspace actions. Every important event is written to the
// project's permanent activity log, and nothing that was locked is ever rewritten.
import { getState, setState } from './store.js';
import { addDays, clone, nowIso, randomToken, uid } from '../lib/util.js';
import { encodeObject } from '../lib/codec.js';
import { estimate, RISK_LABEL } from '../engine/estimate.js';
import { quoteFromVersion } from '../engine/quote.js';
import { packSnapshot } from '../engine/snapshot.js';
import { inputsFromSession, inputsWithDesignerEntries, textOf } from '../engine/versions.js';
import { generateContractSections, quoteFacts } from '../engine/contract.js';
import { money } from '../lib/format.js';
import { QUESTIONS } from '../data/questionnaire.js';

const T = (zh, en) => ({ zh, en });

// ---------------------------------------------------------------------------
// Helpers

function log(project, actor, text, extra = {}) {
  project.activity.unshift({ id: uid('a'), at: nowIso(), actor, text, ...extra });
}

export function updateProject(id, mutate) {
  setState((s) => {
    const current = s.projects[id];
    if (!current) return s;
    const draft = clone(current);
    mutate(draft, s);
    draft.updatedAt = nowIso();
    return { ...s, projects: { ...s.projects, [id]: draft } };
  });
}

export function updateSettings(mutate) {
  setState((s) => {
    const draft = clone(s.settings);
    mutate(draft);
    return { ...s, settings: draft };
  });
}

export function currentSnapshot(settings) {
  return clone({ functions: settings.baseline.functions, rules: settings.baseline.rules, pricing: settings.pricing });
}

export const PROJECT_STATUSES = [
  'draft', 'clientInvited', 'clientInProgress', 'preliminaryReady', 'designerReview',
  'revisedEstimate', 'finalQuote', 'contractDraft', 'completed', 'archived',
];

export function projectStatus(p) {
  if (p.statusOverride) return p.statusOverride;
  if (p.contracts.some((c) => c.status === 'final')) return 'completed';
  if (p.contracts.length) return 'contractDraft';
  if (p.quotes.some((q) => q.kind === 'final' && !['cancelled', 'expired'].includes(q.status))) return 'finalQuote';
  if (p.estimates.some((v) => v.kind !== 'preliminary' && v.locked)) return 'revisedEstimate';
  if (p.estimates.length > 1 || p.interviewNotes.length) return 'designerReview';
  if (p.estimates.length) return 'preliminaryReady';
  if (p.clientSession) return p.clientSession.submittedAt ? 'preliminaryReady' : 'clientInProgress';
  if (p.access) return 'clientInvited';
  return 'draft';
}

export function latestEstimate(p) {
  return p.estimates[p.estimates.length - 1] || null;
}

// ---------------------------------------------------------------------------
// Projects

export function createProject({ name, client, notes }) {
  const id = uid('p');
  const at = nowIso();
  const project = {
    id,
    name: name.trim(),
    client: { name: '', company: '', email: '', phone: '', ...client },
    notes: notes || '',
    createdAt: at,
    updatedAt: at,
    statusOverride: null,
    access: null,
    clientSession: null,
    clientImports: [],
    designerEntries: {},
    infoItems: [],
    interviewNotes: [],
    activity: [],
    estimates: [],
    quotes: [],
    contracts: [],
  };
  log(project, 'designer', T(`建立專案「${project.name}」`, `Created project "${project.name}"`));
  setState((s) => ({ ...s, projects: { ...s.projects, [id]: project } }));
  return id;
}

export function setStatusOverride(id, status) {
  updateProject(id, (p) => {
    p.statusOverride = status || null;
    log(p, 'designer', status ? T(`將專案狀態設為「${status}」`, `Set project status to "${status}"`) : T('恢復自動判斷專案狀態', 'Returned to automatic project status'), { statusKey: status });
  });
}

export function deleteProject(id) {
  setState((s) => {
    const projects = { ...s.projects };
    delete projects[id];
    return { ...s, projects };
  });
}

// ---------------------------------------------------------------------------
// Private access

export function createAccess(id) {
  const { settings } = getState();
  updateProject(id, (p) => {
    const at = nowIso();
    p.access = {
      token: randomToken(12),
      active: true,
      createdAt: at,
      expiresAt: settings.inviteExpiryDays ? addDays(at, settings.inviteExpiryDays) : null,
      history: [{ at, action: 'created' }],
    };
    log(p, 'designer', T('建立私人報價連結', 'Created a private quote link'));
  });
}

export function setAccessActive(id, active) {
  updateProject(id, (p) => {
    if (!p.access) return;
    p.access.active = active;
    p.access.history.push({ at: nowIso(), action: active ? 'reactivated' : 'revoked' });
    log(p, 'designer', active ? T('重新啟用私人連結', 'Reactivated the private link') : T('停用私人連結', 'Revoked the private link'));
  });
}

export function extendAccess(id, days) {
  updateProject(id, (p) => {
    if (!p.access) return;
    p.access.expiresAt = addDays(nowIso(), days);
    p.access.history.push({ at: nowIso(), action: 'extended' });
    log(p, 'designer', T(`連結有效期延長 ${days} 天`, `Extended the link by ${days} days`));
  });
}

/** Everything the client's browser needs to run the questionnaire and estimate. */
export function invitePayload(project, settings) {
  const snap = packSnapshot(currentSnapshot(settings));
  return {
    v: 1,
    token: project.access.token,
    projectId: project.id,
    projectName: project.name,
    designer: { name: settings.designer.name || '', studio: settings.designer.studio || '', email: settings.designer.email || '' },
    expiresAt: project.access.expiresAt,
    createdAt: nowIso(),
    snapshot: snap,
  };
}

/**
 * The link you send: points at your public client site (Settings → Link address).
 * `{ local: true }` points at this workspace instead, for "Preview as client".
 */
export async function inviteLink(project, settings, { local = false } = {}) {
  const payload = await encodeObject(invitePayload(project, settings));
  const here = `${window.location.origin}${window.location.pathname}`;
  let base = (local ? here : settings.appUrl.trim() || here).replace(/#.*$/, '');
  // "https://name.github.io/scopebook" → ".../scopebook/" so the page loads without a redirect.
  if (!/\/$|\.html?$/.test(base)) base += '/';
  return `${base}#/quote/${project.access.token}?d=${payload}`;
}

export function markLinkCopied(id) {
  updateProject(id, (p) => {
    p.access.history.push({ at: nowIso(), action: 'copied' });
    if (!p.access.firstSharedAt) p.access.firstSharedAt = nowIso();
  });
}

// ---------------------------------------------------------------------------
// Client responses (return codes or same-browser sessions)

export function findProjectByToken(token) {
  return Object.values(getState().projects).find((p) => p.access?.token === token) || null;
}

/**
 * @returns {{ok:boolean, error?:string, projectId?:string, createdVersion?:boolean, unchanged?:boolean}}
 */
export function importClientSession(session, { silent = false } = {}) {
  if (!session || !session.token) return { ok: false, error: 'format' };
  const project = findProjectByToken(session.token);
  if (!project || project.id !== session.projectId) return { ok: false, error: 'unknownToken' };
  if (!project.access.active) return { ok: false, error: 'revoked', projectId: project.id };
  const prev = project.clientSession;
  if (prev && prev.lastActiveAt >= session.lastActiveAt) return { ok: true, unchanged: true, projectId: project.id };

  let createdVersion = false;
  updateProject(project.id, (p, state) => {
    p.clientSession = clone(session);
    p.clientImports.push({ at: nowIso(), lastActiveAt: session.lastActiveAt, submitted: !!session.submittedAt, completion: session.completion });
    p.access.lastAccessedAt = session.lastActiveAt;
    if (!p.access.firstOpenedAt) p.access.firstOpenedAt = session.startedAt;
    if (!silent || !prev) {
      log(p, 'designer', T(`匯入客戶回覆（完成度 ${Math.round((session.completion || 0) * 100)}%）`, `Imported client responses (${Math.round((session.completion || 0) * 100)}% complete)`));
    }

    if (session.submittedAt && !p.estimates.length) {
      const version = newVersionRecord(p, {
        inputs: inputsFromSession(session),
        snapshot: clone(session.snapshotUsed || currentSnapshot(state.settings)),
        kind: 'preliminary',
        source: 'client',
        asOf: session.submittedAt,
      });
      lockVersionRecord(version);
      version.sessionAt = session.lastActiveAt;
      p.estimates.push(version);
      log(p, 'system', T('系統依客戶回覆產生初步估價 v1', 'System generated Preliminary Estimate v1 from client responses'));
      const quote = buildQuote(p, version, { kind: 'preliminary', status: 'preliminary' }, state.settings);
      p.quotes.push(quote);
      log(p, 'system', T(`產生初步報價 Q${quote.number}（客戶已可下載）`, `Created Preliminary Quote Q${quote.number} (the version the client could download)`));
      createdVersion = true;
    }
  });
  return { ok: true, projectId: project.id, createdVersion };
}

/** Same-browser sessions (e.g. the client filled it in on the designer's laptop). */
export function syncLocalClientSessions(sessions) {
  const results = [];
  for (const s of sessions) {
    const p = findProjectByToken(s.token);
    if (!p) continue;
    if (!p.clientSession || p.clientSession.lastActiveAt < s.lastActiveAt) results.push(importClientSession(s, { silent: true }));
  }
  return results;
}

export function clientUpdatedSinceV1(p) {
  const v1 = p.estimates.find((v) => v.source === 'client');
  return !!(v1 && p.clientSession && p.clientSession.lastActiveAt > (v1.sessionAt || ''));
}

// ---------------------------------------------------------------------------
// Designer-entered information (always labelled as the designer's)

export function setDesignerEntry(id, qid, value, reason) {
  updateProject(id, (p) => {
    const prev = p.designerEntries[qid];
    const history = prev ? [...prev.history, { value: prev.value, at: prev.at, reason: prev.reason }] : [];
    p.designerEntries[qid] = { value, at: nowIso(), reason: reason || '', history };
    const title = QUESTIONS[qid]?.title || T(qid, qid);
    log(p, 'designer', T(`設計師更新「${title.zh}」`, `Designer updated "${title.en}"`));
  });
}

export function clearDesignerEntry(id, qid) {
  updateProject(id, (p) => {
    delete p.designerEntries[qid];
    log(p, 'designer', T('移除設計師補充的回答', 'Removed a designer-entered answer'));
  });
}

export function addInfoItem(id, { kind, text, relatedFn }) {
  updateProject(id, (p) => {
    p.infoItems.unshift({ id: uid('i'), kind, text, relatedFn: relatedFn || null, at: nowIso() });
    log(p, 'designer', kind === 'assumption' ? T(`新增設計師假設：${text}`, `Added designer assumption: ${text}`) : T(`新增設計師補充資訊：${text}`, `Added designer information: ${text}`));
  });
}

export function removeInfoItem(id, itemId) {
  updateProject(id, (p) => {
    const item = p.infoItems.find((x) => x.id === itemId);
    p.infoItems = p.infoItems.filter((x) => x.id !== itemId);
    if (item) log(p, 'designer', T(`移除補充資訊：${item.text}`, `Removed information: ${item.text}`));
  });
}

export const NOTE_CATEGORIES = ['requirement', 'clarification', 'constraint', 'decision', 'scopeChange', 'assumption', 'unresolved'];

export function addInterviewNote(id, { category, text, relatedFn }) {
  updateProject(id, (p) => {
    p.interviewNotes.unshift({ id: uid('n'), category, text, relatedFn: relatedFn || null, at: nowIso(), author: 'designer' });
    log(p, 'designer', T(`新增訪談紀錄：${text.slice(0, 60)}`, `Added interview note: ${text.slice(0, 60)}`));
  });
}

export function updateClient(id, client) {
  updateProject(id, (p) => {
    p.client = { ...p.client, ...client };
  });
}

// ---------------------------------------------------------------------------
// Estimate versions

function newVersionRecord(p, { inputs, snapshot, kind, source, asOf, basedOn = null, reason = '' }) {
  const at = nowIso();
  return {
    id: uid('v'),
    number: p.estimates.length + 1,
    kind,
    source,
    locked: false,
    createdAt: at,
    asOf: asOf || at,
    lockedAt: null,
    basedOn,
    reason,
    notes: '',
    inputs,
    snapshot,
    system: null,
    overrides: {},
    overrideReasons: {},
    manualAdjustments: [],
    ignoredRules: [],
    extraAssumptions: [],
    removedAssumptions: [],
    extraUnknowns: [],
    resolvedUnknowns: [],
    deliverables: null,
    exclusions: null,
    timelineText: '',
    fixedPrice: null,
    developmentFee: null,
  };
}

function lockVersionRecord(v) {
  v.system = estimate(v.inputs, v.snapshot, { asOf: v.asOf });
  v.locked = true;
  v.lockedAt = nowIso();
}

export function createVersionFromResponses(id) {
  let created = null;
  updateProject(id, (p, state) => {
    const base = p.clientSession ? inputsFromSession(p.clientSession) : { goals: [], improve: [], functions: [], custom: [], flows: {}, answers: {} };
    const hasDesigner = Object.keys(p.designerEntries).length > 0;
    const inputs = inputsWithDesignerEntries(base, p.designerEntries);
    const v = newVersionRecord(p, {
      inputs,
      snapshot: currentSnapshot(state.settings),
      kind: p.estimates.length ? 'revised' : 'preliminary',
      source: hasDesigner ? 'mixed' : 'client',
      basedOn: null,
    });
    v.sessionAt = p.clientSession?.lastActiveAt;
    p.estimates.push(v);
    created = v.id;
    log(p, 'designer', T(`依目前回覆建立估價 v${v.number}`, `Created Estimate v${v.number} from current responses`));
  });
  return created;
}

export function createVersionFromLatest(id, reason) {
  let created = null;
  updateProject(id, (p) => {
    const latest = latestEstimate(p);
    if (!latest) return;
    const v = clone(latest);
    Object.assign(v, {
      id: uid('v'),
      number: p.estimates.length + 1,
      kind: 'revised',
      source: 'designer',
      locked: false,
      createdAt: nowIso(),
      lockedAt: null,
      basedOn: latest.id,
      reason: reason || '',
      notes: '',
      system: null,
    });
    p.estimates.push(v);
    created = v.id;
    log(p, 'designer', T(`由 v${latest.number} 建立新估價版本 v${v.number}`, `Created Estimate v${v.number} from v${latest.number}`));
  });
  return created;
}

export function updateVersion(id, vid, mutate) {
  updateProject(id, (p) => {
    const v = p.estimates.find((x) => x.id === vid);
    if (!v || v.locked) return;
    mutate(v, p);
  });
}

export function refreshVersionSnapshot(id, vid) {
  updateProject(id, (p, state) => {
    const v = p.estimates.find((x) => x.id === vid);
    if (!v || v.locked) return;
    v.snapshot = currentSnapshot(state.settings);
    log(p, 'designer', T(`v${v.number} 改用目前的 Baseline 與定價規則`, `v${v.number} now uses the current baseline and pricing`));
  });
}

export function lockVersion(id, vid, kind) {
  updateProject(id, (p) => {
    const v = p.estimates.find((x) => x.id === vid);
    if (!v || v.locked) return;
    v.kind = kind || v.kind;
    lockVersionRecord(v);
    const label = { preliminary: T('初步估價', 'Preliminary estimate'), revised: T('設計師修訂估價', 'Designer revised estimate'), final: T('最終估價', 'Final estimate') }[v.kind];
    log(p, 'designer', T(`鎖定 v${v.number}（${label.zh}）`, `Locked v${v.number} (${label.en})`));
  });
}

export function deleteDraftVersion(id, vid) {
  updateProject(id, (p) => {
    const v = p.estimates.find((x) => x.id === vid);
    if (!v || v.locked || v !== p.estimates[p.estimates.length - 1]) return;
    p.estimates = p.estimates.filter((x) => x.id !== vid);
    log(p, 'designer', T(`捨棄未鎖定的草稿 v${v.number}`, `Discarded unlocked draft v${v.number}`));
  });
}

// ---------------------------------------------------------------------------
// Quotes (immutable snapshots of a locked estimate)

export function buildQuote(p, version, terms, settings) {
  return quoteFromVersion(version, { number: p.quotes.length + 1, projectName: p.name, client: p.client, designer: settings.designer }, terms);
}

export function createQuote(id, vid, terms) {
  let created = null;
  updateProject(id, (p, state) => {
    const v = p.estimates.find((x) => x.id === vid);
    if (!v || !v.locked) return;
    const q = buildQuote(p, v, terms, state.settings);
    p.quotes.push(q);
    created = q.id;
    const kindLabel = { preliminary: T('初步報價', 'Preliminary quote'), revised: T('修訂報價', 'Revised quote'), final: T('最終報價', 'Final quote') }[q.kind];
    const amount = q.fixedPrice != null ? money(q.fixedPrice, q.currencySymbol) : `${money(q.price.min, q.currencySymbol)}–${money(q.price.max, q.currencySymbol)}`;
    log(p, 'designer', T(`由估價 v${v.number} 產生${kindLabel.zh} Q${q.number}：${amount}`, `Generated ${kindLabel.en} Q${q.number} from Estimate v${v.number}: ${amount}`));
  });
  return created;
}

export function setQuoteStatus(id, qid, status) {
  updateProject(id, (p) => {
    const q = p.quotes.find((x) => x.id === qid);
    if (!q || q.status === status) return;
    q.status = status;
    q.statusHistory.push({ status, at: nowIso() });
    log(p, 'designer', T(`報價 Q${q.number} 狀態改為 ${status}`, `Quote Q${q.number} status changed to ${status}`));
  });
}

// ---------------------------------------------------------------------------
// Contracts

export function generateContract(id, qid, { templateId, lang, ip, portfolio, confidentiality, party }) {
  let created = null;
  updateProject(id, (p, state) => {
    const source = p.quotes.find((x) => x.id === qid);
    const template = state.settings.contracts.templates.find((t) => t.id === templateId);
    if (!source || !template) return;
    // The client's legal name exists only on the contract, never on the project or the link.
    const quote = { ...source, client: { name: (party?.name || '').trim(), company: (party?.company || '').trim() } };
    const { sections } = generateContractSections({ template, quote, settings: state.settings, lang, ip, portfolio, confidentiality });
    const c = {
      id: uid('c'),
      number: p.contracts.length + 1,
      quoteId: quote.id,
      quoteNumber: quote.number,
      templateId,
      templateName: clone(template.name),
      lang,
      options: { ip, portfolio, confidentiality },
      status: 'draft',
      locked: false,
      createdAt: nowIso(),
      lockedAt: null,
      basedOn: null,
      sections,
      facts: quoteFacts(quote, state.settings, lang),
      reason: '',
      party: clone(quote.client),
    };
    p.contracts.push(c);
    created = c.id;
    log(p, 'system', T(`由最終報價 Q${quote.number} 產生合約草稿 C${c.number}`, `Generated Contract Draft C${c.number} from Final Quote Q${quote.number}`));
  });
  return created;
}

export function updateContract(id, cid, mutate) {
  updateProject(id, (p) => {
    const c = p.contracts.find((x) => x.id === cid);
    if (!c || c.locked) return;
    mutate(c);
    c.editedAt = nowIso();
  });
}

export function lockContract(id, cid, status, reason) {
  updateProject(id, (p) => {
    const c = p.contracts.find((x) => x.id === cid);
    if (!c || c.locked) return;
    c.locked = true;
    c.status = status; // 'revision' | 'final'
    c.lockedAt = nowIso();
    if (reason) c.reason = reason;
    log(p, 'designer', status === 'final'
      ? T(`合約 C${c.number} 定稿為最終合約`, `Contract C${c.number} saved as the final contract`)
      : T(`合約 C${c.number} 存為修訂版本`, `Contract C${c.number} saved as a revision`));
  });
}

export function newContractRevision(id, cid) {
  let created = null;
  updateProject(id, (p) => {
    const src = p.contracts.find((x) => x.id === cid);
    if (!src) return;
    const c = clone(src);
    Object.assign(c, { id: uid('c'), number: p.contracts.length + 1, status: 'draft', locked: false, createdAt: nowIso(), lockedAt: null, editedAt: null, basedOn: src.id, reason: '' });
    p.contracts.push(c);
    created = c.id;
    log(p, 'designer', T(`由 C${src.number} 建立合約修訂 C${c.number}`, `Created contract revision C${c.number} from C${src.number}`));
  });
  return created;
}

export function riskText(level) {
  return RISK_LABEL[level];
}

export function versionKindLabel(kind) {
  return { preliminary: T('初步估價', 'Preliminary estimate'), revised: T('設計師修訂估價', 'Designer revised estimate'), final: T('最終估價', 'Final estimate') }[kind];
}

export function quoteKindLabel(kind) {
  return { preliminary: T('初步報價', 'Preliminary quote'), revised: T('修訂報價', 'Revised quote'), final: T('最終報價', 'Final quote') }[kind];
}

export { textOf };
