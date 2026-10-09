// Client session: everything the client says, with full history.
// Pure functions that return a new session; the client app persists it in the
// client's own browser and packs it into a return code for the designer.
import { QUESTIONS, SCREENS, SCORED_QUESTIONS, isVisible } from '../data/questionnaire.js';
import { FLOW_GOALS } from '../data/baseline.js';
import { suggestedFunctionIds } from '../engine/estimate.js';
import { answerText } from '../engine/versions.js';
import { clone, isEmptyAnswer, nowIso, sameValue, uid } from '../lib/util.js';

const T = (zh, en) => ({ zh, en });

export function newSession(invite) {
  const at = nowIso();
  return {
    schema: 1,
    token: invite.token,
    projectId: invite.projectId,
    projectName: invite.projectName,
    inviteCreatedAt: invite.createdAt,
    snapshotUsed: invite.snapshot,
    startedAt: at,
    lastActiveAt: at,
    submittedAt: null,
    screen: 'intro',
    responses: {},
    scope: { generatedFor: null, items: [], custom: [] },
    validation: {},
    validationAck: {},
    flows: {},
    references: [],
    activity: [{ id: uid('a'), at, actor: 'client', text: T('客戶開啟私人專案連結', 'Client opened the private project link') }],
    completion: 0,
    estimateViews: 0,
    downloads: [],
  };
}

function touch(s) {
  s.lastActiveAt = nowIso();
  s.completion = completion(s);
  return s;
}

function log(s, actor, text) {
  s.activity.unshift({ id: uid('a'), at: nowIso(), actor, text });
}

export function answersOf(s) {
  const out = {};
  for (const [k, r] of Object.entries(s.responses)) out[k] = r.value;
  return out;
}

/**
 * Record an answer. Choices commit immediately; text fields update the value
 * while typing and commit (history + activity) on blur.
 */
export function setAnswer(session, qid, value, { commit = true } = {}) {
  const s = clone(session);
  const prev = s.responses[qid];
  const at = nowIso();
  if (!prev) {
    s.responses[qid] = { value, by: 'client', firstAt: at, at, committed: commit ? value : undefined, history: [] };
  } else {
    prev.value = value;
    prev.at = at;
  }
  const r = s.responses[qid];
  if (commit && !sameValue(r.committed, value)) {
    const title = QUESTIONS[qid]?.title || T(qid, qid);
    const before = r.committed;
    if (before !== undefined && !isEmptyAnswer(before)) {
      r.history.push({ value: before, at: r.committedAt || r.firstAt });
      const a = answerText(qid, before);
      const b = answerText(qid, value);
      log(s, 'client', T(`客戶修改「${short(title.zh)}」：${a.zh} → ${b.zh}`, `Client changed "${short(title.en)}": ${a.en} → ${b.en}`));
    } else if (!isEmptyAnswer(value)) {
      const b = answerText(qid, value);
      log(s, 'client', T(`客戶回答「${short(title.zh)}」：${b.zh}`, `Client answered "${short(title.en)}": ${b.en}`));
    }
    r.committed = value;
    r.committedAt = at;
  }
  return touch(s);
}

function short(text, n = 28) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export function toggleMulti(session, qid, optionId) {
  const q = QUESTIONS[qid];
  const current = session.responses[qid]?.value || [];
  let next;
  if (current.includes(optionId)) next = current.filter((x) => x !== optionId);
  else if (q.exclusive?.includes(optionId)) next = [optionId];
  else next = [...current.filter((x) => !q.exclusive?.includes(x)), optionId];
  return setAnswer(session, qid, next);
}

// ---------------------------------------------------------------------------
// Scope

/** Suggest standard functions for the chosen goals; never removes what the client kept. */
export function ensureScope(session, functions) {
  const a = answersOf(session);
  const goals = a.goals || [];
  const improve = a.improve || [];
  const key = JSON.stringify([goals, improve]);
  if (session.scope.generatedFor === key) return session;
  const s = clone(session);
  const suggested = suggestedFunctionIds(goals, improve, functions);
  const existing = new Set(s.scope.items.map((i) => i.fnId));
  const added = suggested.filter((id) => !existing.has(id));
  for (const id of added) s.scope.items.push({ fnId: id, origin: 'suggested', status: 'kept', level: null, at: nowIso() });
  if (added.length) {
    log(s, 'system', s.scope.generatedFor
      ? T(`系統依新目標建議 ${added.length} 項功能`, `System suggested ${added.length} more functions for the updated goals`)
      : T(`系統產生標準範圍（${added.length} 項功能）`, `System generated the standard scope (${added.length} functions)`));
  }
  s.scope.generatedFor = key;
  return touch(s);
}

export function setItemStatus(session, fnId, status, fnName) {
  const s = clone(session);
  const item = s.scope.items.find((i) => i.fnId === fnId);
  if (!item || item.status === status) return session;
  item.status = status;
  log(s, 'client', status === 'removed' ? T(`客戶移除「${fnName.zh}」`, `Client removed "${fnName.en}"`) : T(`客戶保留「${fnName.zh}」`, `Client kept "${fnName.en}"`));
  return touch(s);
}

export function addFunction(session, fnId, fnName) {
  const s = clone(session);
  const item = s.scope.items.find((i) => i.fnId === fnId);
  if (item) item.status = 'kept';
  else s.scope.items.push({ fnId, origin: 'added', status: 'kept', level: null, at: nowIso() });
  log(s, 'client', T(`客戶新增「${fnName.zh}」`, `Client added "${fnName.en}"`));
  return touch(s);
}

export function addCustom(session, name, note) {
  const s = clone(session);
  s.scope.custom.push({ id: uid('c'), name: name.trim(), note: (note || '').trim(), at: nowIso() });
  log(s, 'client', T(`客戶新增額外需求「${name.trim()}」（需設計師評估）`, `Client added a requirement "${name.trim()}" (needs designer review)`));
  return touch(s);
}

export function removeCustom(session, id) {
  const s = clone(session);
  const c = s.scope.custom.find((x) => x.id === id);
  s.scope.custom = s.scope.custom.filter((x) => x.id !== id);
  if (c) log(s, 'client', T(`客戶刪除額外需求「${c.name}」`, `Client removed the requirement "${c.name}"`));
  return touch(s);
}

const LEVEL_TEXT = { basic: 'Basic', advanced: 'Advanced', unsure: T('未定', 'Undecided') };
const lv = (l, lang) => (typeof LEVEL_TEXT[l] === 'string' ? LEVEL_TEXT[l] : LEVEL_TEXT[l]?.[lang] || '—');

export function setLevel(session, fnId, level, fnName) {
  const s = clone(session);
  const item = s.scope.items.find((i) => i.fnId === fnId);
  if (!item || item.level === level) return session;
  const before = item.level;
  item.level = level;
  item.levelHistory = [...(item.levelHistory || []), { from: before, to: level, at: nowIso() }];
  log(s, 'client', before
    ? T(`客戶將「${fnName.zh}」由 ${lv(before, 'zh')} 改為 ${lv(level, 'zh')}`, `Client changed ${fnName.en}: ${lv(before, 'en')} → ${lv(level, 'en')}`)
    : T(`客戶選擇「${fnName.zh}」為 ${lv(level, 'zh')}`, `Client chose ${lv(level, 'en')} for ${fnName.en}`));
  delete s.validationAck[fnId];
  return touch(s);
}

export function setValidation(session, fnId, optionIds) {
  const s = clone(session);
  s.validation[fnId] = optionIds;
  delete s.validationAck[fnId];
  return touch(s);
}

export function ackValidation(session, fnId, fnName, keptLevel) {
  const s = clone(session);
  s.validationAck[fnId] = true;
  log(s, 'client', T(`客戶確認「${fnName.zh}」維持 ${lv(keptLevel, 'zh')}`, `Client kept ${lv(keptLevel, 'en')} for ${fnName.en}`));
  return touch(s);
}

// ---------------------------------------------------------------------------
// Flows

export function setFlowMode(session, goal, mode) {
  const s = clone(session);
  const prev = s.flows[goal];
  const name = FLOW_GOALS[goal].name;
  if (mode === 'custom' && (!prev || !prev.steps?.length)) {
    s.flows[goal] = {
      mode,
      steps: FLOW_GOALS[goal].steps.map((st) => ({ id: uid('st'), type: st.type, preset: st.label, text: '', branches: [], unsure: false })),
    };
  } else {
    s.flows[goal] = { ...(prev || { steps: [] }), mode };
  }
  const modeText = { standard: T('以常見做法估算', 'standard pattern'), custom: T('自訂流程', 'custom flow'), unsure: T('還不確定', 'not sure') }[mode];
  log(s, 'client', T(`客戶將${name.zh}設為：${modeText.zh}`, `Client set the ${name.en.toLowerCase()} to: ${modeText.en}`));
  return touch(s);
}

export function updateFlowSteps(session, goal, steps, note) {
  const s = clone(session);
  s.flows[goal] = { ...(s.flows[goal] || { mode: 'custom' }), steps };
  if (note) log(s, 'client', note);
  return touch(s);
}

// ---------------------------------------------------------------------------
// References

export function setReferences(session, references, note) {
  const s = clone(session);
  s.references = references;
  if (note) log(s, 'client', note);
  return touch(s);
}

// ---------------------------------------------------------------------------
// Progress

export function visibleQuestions(session) {
  const a = answersOf(session);
  return SCORED_QUESTIONS.filter((q) => isVisible(q, a));
}

/** Share of applicable questions answered (contact details excluded). */
export function completion(session) {
  const vis = visibleQuestions(session);
  const a = answersOf(session);
  let done = vis.filter((q) => !isEmptyAnswer(a[q])).length;
  let total = vis.length + 3; // scope, levels, flows
  const kept = session.scope.items.filter((i) => i.status !== 'removed');
  if (kept.length) done += 1;
  if (kept.length && kept.every((i) => i.level)) done += 1;
  if (session.screenVisited?.flows) done += 1;
  return Math.min(1, total ? done / total : 0);
}

export function markScreen(session, screenId) {
  if (session.screen === screenId && session.screenVisited?.[screenId]) return session;
  const s = clone(session);
  const prev = s.screen;
  s.screen = screenId;
  s.screenVisited = { ...(s.screenVisited || {}), [screenId]: true };
  const prevDef = SCREENS.find((x) => x.id === prev);
  if (prevDef && !s.screenCompleted?.[prev]) {
    s.screenCompleted = { ...(s.screenCompleted || {}), [prev]: nowIso() };
    log(s, 'client', T(`客戶完成「${SCREEN_NAMES[prev]?.zh || prev}」`, `Client completed ${SCREEN_NAMES[prev]?.en || prev}`));
  }
  return touch(s);
}

export const SCREEN_NAMES = {
  goals: T('目標', 'Goals'),
  current: T('現況', 'Current state'),
  scope: T('功能範圍', 'Scope'),
  levels: T('功能程度', 'Basic / Advanced'),
  flows: T('流程', 'Flows'),
  roles: T('使用者身分', 'User types'),
  statuses: T('處理狀態', 'Stages'),
  dataVolume: T('資料量', 'Data'),
  specialCases: T('特殊情況', 'Special cases'),
  integrations: T('系統串接', 'Integrations'),
  devices: T('裝置', 'Devices'),
  team: T('合作對象', 'Collaboration'),
  content: T('內容準備', 'Content readiness'),
  tech: T('技術限制', 'Technical constraints'),
  timeline: T('時程', 'Timeline'),
  references: T('參考資料', 'References'),
  engineering: T('工程開發', 'Engineering'),
  note: T('補充說明', 'Anything else'),
};

export function noteEstimateView(session) {
  const s = clone(session);
  s.estimateViews = (s.estimateViews || 0) + 1;
  log(s, 'client', T('客戶查看目前估價', 'Client viewed the current estimate'));
  return touch(s);
}

export function noteDownload(session) {
  const s = clone(session);
  s.downloads = [...(s.downloads || []), nowIso()];
  log(s, 'client', T('客戶下載初步報價 PDF', 'Client downloaded the preliminary quote PDF'));
  return touch(s);
}

export function submit(session) {
  const s = clone(session);
  s.submittedAt = nowIso();
  log(s, 'client', T('客戶送出專案資訊', 'Client submitted the project information'));
  return touch(s);
}
