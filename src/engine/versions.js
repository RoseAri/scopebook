// Estimate versions, overrides, diffs and Quote ↔ Contract consistency.
// System estimate and designer estimate are always kept apart: the system
// result is computed (and frozen when a version is locked); designer overrides
// sit on top with their reasons and never rewrite the system result.
import { FLOW_GOALS } from '../data/baseline.js';
import { QUESTIONS, isVisible } from '../data/questionnaire.js';
import { estimate, priceFor, LEVEL_LABEL, RISK_LABEL, PRESSURE_LABEL, CONFIDENCE_LABEL } from './estimate.js';
import { sameValue } from '../lib/util.js';

const T = (zh, en) => ({ zh, en });

export const textOf = (item, lang) => (item == null ? '' : typeof item === 'string' ? item : item[lang] || item.zh || item.en || '');

/** Client session → engine inputs. Only client-provided data. */
export function inputsFromSession(session) {
  const all = {};
  for (const [qid, r] of Object.entries(session?.responses || {})) all[qid] = r.value;
  // Answers to follow-up questions that no longer apply are kept in the record but not estimated.
  const answers = {};
  for (const [qid, v] of Object.entries(all)) if (!QUESTIONS[qid] || isVisible(qid, all)) answers[qid] = v;
  const scope = session?.scope || { items: [], custom: [] };
  return {
    goals: answers.goals || [],
    improve: answers.improve || [],
    functions: scope.items.filter((i) => i.status !== 'removed').map((i) => ({ fnId: i.fnId, level: i.level || 'basic', levelChosen: !!i.level, origin: i.origin })),
    custom: (scope.custom || []).map((c) => ({ id: c.id, name: c.name, note: c.note || '', origin: 'client', hours: null, included: false })),
    flows: session?.flows || {},
    answers,
  };
}

/** Merge designer-entered answers over client answers (designer edits stay labelled as designer). */
export function inputsWithDesignerEntries(inputs, designerEntries = {}) {
  const answers = { ...inputs.answers };
  for (const [qid, entry] of Object.entries(designerEntries)) answers[qid] = entry.value;
  return { ...inputs, answers, goals: answers.goals || inputs.goals, improve: answers.improve || inputs.improve };
}

export function systemFor(version) {
  if (version.locked && version.system) return version.system;
  return estimate(version.inputs, version.snapshot, { asOf: version.asOf || version.createdAt });
}

export function timelineTextFor(schedule) {
  if (schedule.weeks) return T(`約 ${Math.ceil(schedule.weeks)} 週`, `About ${Math.ceil(schedule.weeks)} weeks`);
  if (schedule.minWeeks) return T(`約 ${schedule.minWeeks} 週起（依雙方確認之時程）`, `From about ${schedule.minWeeks} weeks (schedule to be agreed)`);
  return T('依雙方確認之時程', 'Schedule to be agreed');
}

/** The effective (designer-reviewed) estimate for a version. */
export function effectiveEstimate(version) {
  const system = systemFor(version);
  const o = version.overrides || {};
  const pricing = version.snapshot.pricing;
  const effort = o.effort ? { min: Number(o.effort.min), max: Number(o.effort.max), point: Math.round((Number(o.effort.min) + Number(o.effort.max)) / 2) } : system.effort;
  const risk = o.risk || system.risk.level;
  const confidence = o.confidence || system.confidence.level;
  const schedule = o.schedule || system.schedule.pressure;
  const rate = o.rate != null && o.rate !== '' ? Number(o.rate) : pricing.hourlyRate;
  const ctx = { ...system.ctx, risk, schedule };
  const computed = priceFor(effort, ctx, pricing, rate, version.manualAdjustments || [], version.ignoredRules || []);
  const price = o.price ? { ...computed, total: { min: Number(o.price.min), max: Number(o.price.max) }, overridden: true } : computed;
  const removedA = new Set(version.removedAssumptions || []);
  const resolvedU = new Set(version.resolvedUnknowns || []);
  return {
    system,
    effort,
    screens: o.screens != null && o.screens !== '' ? Number(o.screens) : system.counts.screens,
    states: o.states != null && o.states !== '' ? Number(o.states) : system.counts.states,
    risk,
    confidence,
    schedule,
    rate,
    price,
    fixedPrice: version.fixedPrice != null && version.fixedPrice !== '' ? Number(version.fixedPrice) : null,
    developmentFee: version.developmentFee != null && version.developmentFee !== '' ? Number(version.developmentFee) : null,
    assumptions: [
      ...system.assumptions.filter((x) => !removedA.has(x.id)).map((x) => ({ ...x, by: 'system' })),
      ...(version.extraAssumptions || []).map((x) => ({ ...x, by: 'designer' })),
    ],
    unknowns: [
      ...system.unknowns.filter((x) => !resolvedU.has(x.id)).map((x) => ({ ...x, by: 'system' })),
      ...(version.extraUnknowns || []).map((x) => ({ ...x, by: 'designer' })),
    ],
    deliverables: version.deliverables || system.deliverables,
    exclusions: version.exclusions || pricing.defaultExclusions,
    timelineText: version.timelineText || timelineTextFor(system.schedule),
    overridden: Object.keys(o).filter((k) => o[k] != null && o[k] !== ''),
  };
}

/** Headline figure for lists: a range, or the final fixed price. */
export function headlinePrice(eff) {
  if (eff.fixedPrice != null) return { min: eff.fixedPrice, max: eff.fixedPrice };
  return eff.price.total;
}

// ---------------------------------------------------------------------------
// What changed between two versions

export function diffVersions(prev, next, fnNames) {
  const changes = [];
  const pe = effectiveEstimate(prev);
  const ne = effectiveEstimate(next);
  const name = (id) => fnNames[id] || T(id, id);

  const pf = Object.fromEntries(prev.inputs.functions.map((f) => [f.fnId, f]));
  const nf = Object.fromEntries(next.inputs.functions.map((f) => [f.fnId, f]));
  for (const id of Object.keys(nf)) {
    if (!pf[id]) changes.push({ kind: 'added', label: T('新增功能', 'Added function'), value: name(id) });
    else if (pf[id].level !== nf[id].level) changes.push({ kind: 'changed', label: name(id), from: LEVEL_LABEL[pf[id].level], to: LEVEL_LABEL[nf[id].level] });
  }
  for (const id of Object.keys(pf)) if (!nf[id]) changes.push({ kind: 'removed', label: T('移除功能', 'Removed function'), value: name(id) });

  const pc = Object.fromEntries((prev.inputs.custom || []).map((c) => [c.id, c]));
  const nc = Object.fromEntries((next.inputs.custom || []).map((c) => [c.id, c]));
  for (const id of Object.keys(nc)) {
    const c = nc[id];
    if (!pc[id]) changes.push({ kind: 'added', label: T('新增額外需求', 'Added requirement'), value: T(c.name, c.name) });
    else if (pc[id].hours !== c.hours || pc[id].included !== c.included) {
      changes.push({ kind: 'changed', label: T(c.name, c.name), from: T(pc[id].included ? `${pc[id].hours}h` : '待評估', pc[id].included ? `${pc[id].hours}h` : 'To review'), to: T(c.included ? `${c.hours}h` : '待評估', c.included ? `${c.hours}h` : 'To review') });
    }
  }
  for (const id of Object.keys(pc)) if (!nc[id]) changes.push({ kind: 'removed', label: T('移除額外需求', 'Removed requirement'), value: T(pc[id].name, pc[id].name) });

  for (const g of Object.keys(FLOW_GOALS)) {
    const a = prev.inputs.flows?.[g];
    const b = next.inputs.flows?.[g];
    if (!sameValue(a, b) && (a || b)) changes.push({ kind: 'changed', label: FLOW_GOALS[g].name, from: flowSummary(a), to: flowSummary(b) });
  }

  const pa = prev.inputs.answers || {};
  const na = next.inputs.answers || {};
  for (const qid of Object.keys({ ...pa, ...na })) {
    if (sameValue(pa[qid], na[qid]) || !QUESTIONS[qid]) continue;
    changes.push({ kind: 'changed', label: shortQuestion(qid), from: answerText(qid, pa[qid]), to: answerText(qid, na[qid]) });
  }

  const hrs = (r) => T(`${r.min}–${r.max}h`, `${r.min}–${r.max}h`);
  if (pe.effort.min !== ne.effort.min || pe.effort.max !== ne.effort.max) {
    changes.push({ kind: 'changed', label: T('預估工時', 'Estimated effort'), from: hrs(pe.effort), to: hrs(ne.effort), metric: true });
  }
  const pp = pe.fixedPrice != null ? { min: pe.fixedPrice, max: pe.fixedPrice } : pe.price.total;
  const np = ne.fixedPrice != null ? { min: ne.fixedPrice, max: ne.fixedPrice } : ne.price.total;
  if (!sameValue(pp, np)) changes.push({ kind: 'changed', label: T('價格', 'Price'), from: { money: pp }, to: { money: np }, metric: true });
  if (pe.screens !== ne.screens) changes.push({ kind: 'changed', label: T('預估畫面數', 'Estimated screens'), from: T(String(pe.screens), String(pe.screens)), to: T(String(ne.screens), String(ne.screens)), metric: true });
  if (pe.states !== ne.states) changes.push({ kind: 'changed', label: T('預估狀態數', 'Estimated states'), from: T(String(pe.states), String(pe.states)), to: T(String(ne.states), String(ne.states)), metric: true });
  if (pe.risk !== ne.risk) changes.push({ kind: 'changed', label: T('風險', 'Risk'), from: RISK_LABEL[pe.risk], to: RISK_LABEL[ne.risk], metric: true });
  if (pe.confidence !== ne.confidence) changes.push({ kind: 'changed', label: T('信心程度', 'Confidence'), from: CONFIDENCE_LABEL[pe.confidence], to: CONFIDENCE_LABEL[ne.confidence], metric: true });
  if (pe.schedule !== ne.schedule) changes.push({ kind: 'changed', label: T('時程壓力', 'Schedule pressure'), from: pe.schedule ? PRESSURE_LABEL[pe.schedule] : T('—', '—'), to: ne.schedule ? PRESSURE_LABEL[ne.schedule] : T('—', '—'), metric: true });
  if (pe.rate !== ne.rate) changes.push({ kind: 'changed', label: T('時薪', 'Hourly rate'), from: { money: { min: pe.rate, max: pe.rate } }, to: { money: { min: ne.rate, max: ne.rate } }, metric: true });
  return changes;
}

function flowSummary(flow) {
  if (!flow || !flow.mode || flow.mode === 'standard') return T('常見做法', 'Standard pattern');
  if (flow.mode === 'unsure') return T('未定', 'Not sure');
  const b = (flow.steps || []).reduce((n, s) => n + (s.branches || []).length, 0);
  return T(`自訂流程：${flow.steps.length} 步、${b} 個分支`, `Custom: ${flow.steps.length} steps, ${b} branches`);
}

export function shortQuestion(qid) {
  return QUESTIONS[qid]?.title || T(qid, qid);
}

export function answerText(qid, value) {
  const q = QUESTIONS[qid];
  if (value == null || (Array.isArray(value) && !value.length) || value === '') return T('（未回答）', '(no answer)');
  if (!q?.options) return T(String(value), String(value));
  const ids = Array.isArray(value) ? value : [value];
  const labels = ids.map((id) => q.options.find((o) => o.id === id)?.label || T(id, id));
  return T(labels.map((l) => l.zh).join('、'), labels.map((l) => l.en).join(', '));
}

// ---------------------------------------------------------------------------
// Final Quote → Contract consistency

const norm = (s) => String(s || '').replace(/[\s,，]+/g, '').toLowerCase();

/**
 * @param contractText full contract text (all enabled sections)
 * @param facts        array of { id, label, expected: string[] } — every expected string must appear
 */
export function checkConsistency(contractText, facts) {
  const text = norm(contractText);
  return facts.map((f) => {
    const missing = f.expected.filter((e) => e && !text.includes(norm(e)));
    return { ...f, ok: missing.length === 0, missing };
  });
}
