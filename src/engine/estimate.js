// Rule-based estimation engine.
//
// Pure functions only: same inputs + same baseline snapshot = same estimate.
// Every hour in the result is traceable to a line with a reason, and every
// number comes from the designer's configurable baseline, rules and pricing.
//
// Three separate signal tracks (never merged into one score):
//   effort signals   → estimated hours
//   risk signals     → risk level
//   schedule signals → schedule pressure
import { FLOW_GOALS, GOALS, IMPROVEMENTS } from '../data/baseline.js';
import { QUESTIONS, isVisible } from '../data/questionnaire.js';
import { roundTo, sum, uniq, weeksBetween } from '../lib/util.js';

const T = (zh, en) => ({ zh, en });
const h = (n) => Math.round(n * 10) / 10;

export const LEVELS = ['basic', 'advanced', 'unsure'];
export const LEVEL_LABEL = { basic: T('Basic', 'Basic'), advanced: T('Advanced', 'Advanced'), unsure: T('未定', 'Undecided') };
export const RISK_LABEL = { low: T('低', 'Low'), medium: T('中', 'Medium'), high: T('高', 'High') };
export const PRESSURE_LABEL = { low: T('低', 'Low'), medium: T('中', 'Medium'), high: T('高', 'High'), veryHigh: T('非常高', 'Very high') };
export const CONFIDENCE_LABEL = { low: T('低', 'Low'), medium: T('中', 'Medium'), high: T('高', 'High') };
export const COORDINATION_LABEL = { light: T('輕', 'Light'), moderate: T('中', 'Moderate'), heavy: T('高', 'Heavy') };

const DEADLINE_WEEKS = { '1m': 4, '1-2m': 6, '2-3m': 10, '3m+': 16 };
const EXTRA_ROLES = { 1: 0, 2: 1, '3plus': 2, unsure: 1 };

// ---------------------------------------------------------------------------
// Scope helpers

export function suggestedFunctionIds(goals = [], improve = [], functions = []) {
  const ids = [];
  for (const g of goals) {
    for (const f of functions) if (f.goals?.includes(g)) ids.push(f.id);
  }
  for (const i of improve) {
    const imp = IMPROVEMENTS.find((x) => x.id === i);
    if (imp) ids.push(...imp.functions);
  }
  const known = new Set(functions.map((f) => f.id));
  return uniq(ids).filter((id) => known.has(id));
}

export function levelSpec(fnDef, level) {
  if (!fnDef) return { effort: 0, screens: 0, states: 0 };
  if (level === 'advanced') return fnDef.advanced;
  if (level === 'basic') return fnDef.basic;
  // Undecided: estimate halfway between Basic and Advanced.
  return {
    effort: (fnDef.basic.effort + fnDef.advanced.effort) / 2,
    screens: Math.round((fnDef.basic.screens + fnDef.advanced.screens) / 2),
    states: Math.round((fnDef.basic.states + fnDef.advanced.states) / 2),
    scope: fnDef.basic.scope,
    flow: fnDef.basic.flow,
  };
}

/** Basic/Advanced validation: returns 'basic' | 'advanced' | null (no suggestion). */
export function validationSuggestion(fnDef, chosenLevel, selectedOptionIds = []) {
  if (!fnDef?.validation || !selectedOptionIds.length || chosenLevel === 'unsure') return null;
  const signals = selectedOptionIds
    .map((id) => fnDef.validation.options.find((o) => o.id === id)?.signal)
    .filter(Boolean);
  if (!signals.length) return null;
  const wantsAdvanced = signals.includes('advanced');
  if (chosenLevel === 'advanced' && !wantsAdvanced) return 'basic';
  if (chosenLevel === 'basic' && wantsAdvanced) return 'advanced';
  return null;
}

export function flowGoalsInScope(fns, fnDefs, selectedGoals = []) {
  const chosen = selectedGoals.filter((g) => FLOW_GOALS[g]);
  const goals = new Set();
  for (const f of fns) {
    const def = fnDefs[f.fnId];
    if (!def || def.tags?.includes('entry')) continue;
    for (const g of def.goals || []) if (FLOW_GOALS[g] && (!chosen.length || chosen.includes(g))) goals.add(g);
  }
  return [...goals];
}

export function flowTier(flow, goalId) {
  if (!flow || flow.mode !== 'custom') return { tier: 'none', extra: 0, branches: 0, external: 0, unsure: 0 };
  const steps = flow.steps || [];
  const standardCount = FLOW_GOALS[goalId]?.steps.length || 0;
  const extra = Math.max(0, steps.length - standardCount);
  const branches = sum(steps, (s) => (s.branches || []).length);
  const external = steps.filter((s) => s.type === 'external').length;
  const unsure = steps.filter((s) => s.unsure).length;
  let tier = 'none';
  if (branches >= 2 || extra >= 3 || (branches >= 1 && extra >= 2)) tier = 'high';
  else if (branches >= 1 || extra >= 1 || external >= 1) tier = 'moderate';
  return { tier, extra, branches, external, unsure };
}

// ---------------------------------------------------------------------------
// Main estimate

/**
 * @param inputs   { goals, improve, functions:[{fnId, level}], custom:[...], flows:{}, answers:{} }
 * @param snapshot { functions:[baseline fns], rules, pricing }
 * @param opts     { asOf: ISO date used for "specific date" deadlines }
 */
export function estimate(inputs, snapshot, opts = {}) {
  const asOf = opts.asOf || new Date().toISOString();
  const rules = snapshot.rules;
  const pricing = snapshot.pricing;
  const fnDefs = Object.fromEntries(snapshot.functions.map((f) => [f.id, f]));
  const a = inputs.answers || {};
  const fns = (inputs.functions || []).filter((f) => fnDefs[f.fnId]);
  const lines = [];
  const risk = [];
  const unknowns = [];
  const assumptions = [];

  const spec = (f) => levelSpec(fnDefs[f.fnId], f.level);
  const baseOf = (f) => spec(f).effort;
  const withTag = (tag) => fns.filter((f) => fnDefs[f.fnId].tags?.includes(tag));
  const nameOf = (f) => fnDefs[f.fnId].name;

  // 1. Base function effort -------------------------------------------------
  const baseDetail = fns.map((f) => ({
    label: T(`${nameOf(f).zh}（${LEVEL_LABEL[f.level].zh}）`, `${nameOf(f).en} (${LEVEL_LABEL[f.level].en})`),
    hours: h(baseOf(f)),
  }));
  const baseHours = sum(fns, baseOf);
  lines.push({
    id: 'base',
    label: T('功能基礎工時', 'Base function effort'),
    note: T(`${fns.length} 項功能，依我的 Baseline 計算`, `${fns.length} functions, from My Baseline`),
    hours: h(baseHours),
    detail: baseDetail,
  });

  for (const f of fns) {
    if (f.level === 'unsure') {
      unknowns.push({ id: `level:${f.fnId}`, impact: 'medium', text: T(`${nameOf(f).zh}：Basic 或 Advanced 未定`, `${nameOf(f).en}: Basic or Advanced not decided`) });
      assumptions.push({ id: `level:${f.fnId}`, text: T(`${nameOf(f).zh} 以 Basic 與 Advanced 之間估算`, `${nameOf(f).en} estimated halfway between Basic and Advanced`) });
    }
  }

  // 2. Flow complexity — each function counted once, at its highest tier -----
  const flowGoals = flowGoalsInScope(fns, fnDefs, inputs.goals || []);
  const fnFlowTier = {};
  const tierRank = { none: 0, moderate: 1, high: 2 };
  const flowDetail = [];
  for (const g of flowGoals) {
    const flow = inputs.flows?.[g];
    const name = FLOW_GOALS[g].name;
    if (!flow || flow.mode === 'standard' || !flow.mode) {
      assumptions.push({ id: `flow:${g}`, text: T(`${name.zh}以常見做法估算（Standard Pattern）`, `${name.en} estimated as a standard pattern`) });
      continue;
    }
    if (flow.mode === 'unsure') {
      unknowns.push({ id: `flow:${g}`, impact: 'medium', text: T(`${name.zh}的實際步驟`, `Actual steps of the ${name.en.toLowerCase()}`) });
      assumptions.push({ id: `flow:${g}`, text: T(`${name.zh}暫以常見做法估算`, `${name.en} provisionally estimated as a standard pattern`) });
      continue;
    }
    const t = flowTier(flow, g);
    if (t.unsure) unknowns.push({ id: `flowsteps:${g}`, impact: 'medium', text: T(`${name.zh}中有 ${t.unsure} 個步驟尚未確定`, `${t.unsure} step(s) in the ${name.en.toLowerCase()} not yet clear`) });
    if (t.tier === 'none') {
      assumptions.push({ id: `flow:${g}`, text: T(`${name.zh}與常見做法相近`, `${name.en} is close to the standard pattern`) });
      continue;
    }
    for (const f of fns) {
      const def = fnDefs[f.fnId];
      if (def.tags?.includes('entry') || !def.goals?.includes(g)) continue;
      if (tierRank[t.tier] > tierRank[fnFlowTier[f.fnId] || 'none']) fnFlowTier[f.fnId] = t.tier;
    }
    flowDetail.push({
      label: T(
        `${name.zh}：${t.tier === 'high' ? '高' : '中'}（多 ${t.extra} 步、${t.branches} 個分支${t.external ? `、${t.external} 個外部串接` : ''}）`,
        `${name.en}: ${t.tier === 'high' ? 'high' : 'moderate'} (${t.extra} extra steps, ${t.branches} branches${t.external ? `, ${t.external} external` : ''})`,
      ),
      hours: null,
    });
  }
  let flowHours = 0;
  for (const f of fns) {
    const tier = fnFlowTier[f.fnId];
    if (!tier) continue;
    const pct = tier === 'high' ? rules.flow.highPct : rules.flow.moderatePct;
    flowHours += (baseOf(f) * pct) / 100;
  }
  if (flowHours > 0) {
    lines.push({
      id: 'flow',
      label: T('流程複雜度', 'Flow complexity'),
      note: T('僅計入受影響流程中的功能', 'Applied only to functions in the affected flows'),
      hours: h(flowHours),
      detail: flowDetail,
    });
  }

  // 3. State complexity ------------------------------------------------------
  const statuses = a.statuses;
  const statefulFns = withTag('stateful');
  const statusLevel = statuses === 'unsure' ? 'few' : statuses;
  let stateHours = 0;
  if ((statusLevel === 'few' || statusLevel === 'many') && statefulFns.length) {
    const pct = statusLevel === 'many' ? rules.states.manyPct : rules.states.fewPct;
    stateHours = (sum(statefulFns, baseOf) * pct) / 100;
    lines.push({
      id: 'states',
      label: T('狀態複雜度', 'State complexity'),
      note: T(`${statefulFns.length} 項有處理狀態的功能 × ${pct}%`, `${statefulFns.length} functions with stages × ${pct}%`),
      hours: h(stateHours),
      detail: statefulFns.map((f) => ({ label: nameOf(f), hours: h((baseOf(f) * pct) / 100) })),
    });
  }
  if (statuses === 'unsure') unknowns.push({ id: 'statuses', impact: 'medium', text: T('處理狀態的數量', 'How many stages items go through') });

  // 4. Roles / permissions ---------------------------------------------------
  const extraRoles = EXTRA_ROLES[a.roles] ?? 0;
  const roleDiff = a.roleDiff === 'unsure' ? 'content' : a.roleDiff;
  const roleFns = withTag('roleSensitive');
  let roleHours = 0;
  let roleScreenFactor = 0;
  if (extraRoles > 0 && (roleDiff === 'content' || roleDiff === 'workflows') && roleFns.length) {
    const pct = roleDiff === 'workflows' ? rules.roles.veryPct : rules.roles.somePct;
    roleScreenFactor = roleDiff === 'workflows' ? rules.roles.veryScreenFactor : rules.roles.someScreenFactor;
    roleHours = (sum(roleFns, baseOf) * pct * extraRoles) / 100;
    lines.push({
      id: 'roles',
      label: T('角色／權限複雜度', 'Role / permission complexity'),
      note: T(`另 ${extraRoles} 種身分 × ${pct}%，僅計入受身分影響的功能`, `${extraRoles} additional user type(s) × ${pct}%, role-sensitive functions only`),
      hours: h(roleHours),
      detail: roleFns.map((f) => ({ label: nameOf(f), hours: h((baseOf(f) * pct * extraRoles) / 100) })),
    });
  }
  if (a.roles === 'unsure') unknowns.push({ id: 'roles', impact: 'high', text: T('使用者身分種類', 'Types of users') });
  if (a.roleDiff === 'unsure') unknowns.push({ id: 'roleDiff', impact: 'medium', text: T('不同身分之間的差異', 'How user types differ') });
  if (a.roles === '1') assumptions.push({ id: 'roles', text: T('只有一種使用者身分', 'One type of user') });

  // 5. Data complexity -------------------------------------------------------
  const dataLevel = a.dataVolume === 'unsure' ? 'moderate' : a.dataVolume;
  const dataFns = withTag('dataHeavy');
  let dataHours = 0;
  if ((dataLevel === 'moderate' || dataLevel === 'heavy') && dataFns.length) {
    const pct = dataLevel === 'heavy' ? rules.data.heavyPct : rules.data.moderatePct;
    dataHours = (sum(dataFns, baseOf) * pct) / 100;
    lines.push({
      id: 'data',
      label: T('資料複雜度', 'Data complexity'),
      note: T(`${dataFns.length} 項資料密集功能 × ${pct}%`, `${dataFns.length} data-heavy functions × ${pct}%`),
      hours: h(dataHours),
      detail: dataFns.map((f) => ({ label: nameOf(f), hours: h((baseOf(f) * pct) / 100) })),
    });
  }
  if (a.dataVolume === 'unsure') unknowns.push({ id: 'dataVolume', impact: 'medium', text: T('資料量與管理方式', 'Amount of data and how it is managed') });

  // 6. Exceptions — only when a matching function is in scope ---------------
  const caseLabels = Object.fromEntries((QUESTIONS.specialCases.options || []).map((o) => [o.id, o.label]));
  const exDetail = [];
  let exceptionCount = 0;
  for (const c of a.specialCases || []) {
    const rule = rules.exceptions[c];
    if (!rule) continue;
    const applies = rule.requires.some((id) => fns.some((f) => f.fnId === id));
    if (!applies) continue;
    exceptionCount += 1;
    exDetail.push({ label: caseLabels[c], hours: rule.hours });
  }
  const exceptionHours = sum(exDetail, (d) => d.hours);
  if (exceptionHours > 0) {
    lines.push({ id: 'exceptions', label: T('例外情境', 'Exception handling'), note: T('僅計入範圍內有對應功能的情境', 'Only cases with a matching function in scope'), hours: h(exceptionHours), detail: exDetail });
  }
  if ((a.specialCases || []).includes('unsure')) unknowns.push({ id: 'specialCases', impact: 'medium', text: T('需要特別處理的情況', 'Situations needing special handling') });

  // 7. Integrations — effort only when it creates design work; otherwise risk -
  const intLabels = Object.fromEntries((QUESTIONS.integrations.options || []).map((o) => [o.id, o.label]));
  const intDetail = [];
  for (const i of a.integrations || []) {
    const rule = rules.integrations[i];
    if (!rule) continue;
    if (rule.hours > 0) intDetail.push({ label: intLabels[i], hours: rule.hours });
    if (rule.risk && rule.risk !== 'low') risk.push({ id: `int:${i}`, level: rule.risk, text: T(`串接：${intLabels[i].zh}`, `Integration: ${intLabels[i].en}`) });
    if (rule.unknown) unknowns.push({ id: `int:${i}`, impact: 'high', text: T(`${intLabels[i].zh}的串接細節`, `${intLabels[i].en} integration details`) });
  }
  const integrationHours = sum(intDetail, (d) => d.hours);
  if (integrationHours > 0) {
    lines.push({ id: 'integrations', label: T('串接相關設計', 'Integration design'), note: T('只計入會產生介面設計的串接', 'Only integrations that create interface work'), hours: h(integrationHours), detail: intDetail });
  }
  if ((a.integrations || []).includes('unsure')) unknowns.push({ id: 'integrations', impact: 'high', text: T('是否需要串接其他系統', 'Whether other systems must be connected') });

  const designCore = baseHours + flowHours + stateHours + roleHours + dataHours + exceptionHours + integrationHours;

  // 8. Responsive ------------------------------------------------------------
  const devices = a.devices === 'unsure' ? 'both' : a.devices;
  const respPct = devices === 'both' ? rules.responsive.bothPct : devices === 'multi' ? rules.responsive.multiPct : devices ? rules.responsive.primaryPct : 0;
  const respHours = (designCore * respPct) / 100;
  if (respHours > 0) {
    lines.push({
      id: 'responsive',
      label: T('響應式複雜度', 'Responsive complexity'),
      note: T(`設計工時 × ${respPct}%（版面與互動需隨裝置轉換）`, `Design effort × ${respPct}% (layouts and interactions adapt per device)`),
      hours: h(respHours),
    });
  }
  if (a.devices === 'unsure') unknowns.push({ id: 'devices', impact: 'medium', text: T('主要使用裝置', 'Primary devices') });
  if (devices === 'desktop' || devices === 'mobile') {
    assumptions.push({ id: 'devices', text: devices === 'desktop' ? T('以桌機為主要設計，手機為基本響應式', 'Desktop-first design with basic responsive behaviour') : T('以手機為主要設計，桌機為基本響應式', 'Mobile-first design with basic responsive behaviour') });
  }

  // 9. Existing system / current state --------------------------------------
  const existingDetail = [];
  if (['spreadsheet', 'manual'].includes(a.currentState)) {
    existingDetail.push({ label: T('理解現有人工流程', 'Mapping the current manual process'), hours: rules.existing.manualProcess });
  } else if (a.currentState && a.currentState !== 'none' && a.approach) {
    const hrs = rules.existing[a.approach];
    const label = QUESTIONS.approach.options.find((x) => x.id === a.approach)?.label;
    if (hrs) existingDetail.push({ label: T(`現有系統檢視：${label.zh}`, `Existing system review: ${label.en}`), hours: hrs });
  }
  const existingHours = sum(existingDetail, (d) => d.hours);
  if (existingHours > 0) lines.push({ id: 'existing', label: T('現有系統檢視', 'Existing system review'), hours: h(existingHours), detail: existingDetail });
  if (a.approach === 'unsure') unknowns.push({ id: 'approach', impact: 'medium', text: T('改版或延續現有設計的方式', 'Whether to redesign or extend the current design') });
  if (a.approach === 'continue') assumptions.push({ id: 'approach', text: T('延續現有設計語言', 'Existing visual language is kept') });

  // 10. Technical constraints ------------------------------------------------
  const techLabels = Object.fromEntries((QUESTIONS.techConstraints.options || []).map((o) => [o.id, o.label]));
  const techDetail = [];
  for (const c of a.techConstraints || []) {
    const rule = rules.tech[c];
    if (!rule) continue;
    if (rule.hours > 0) techDetail.push({ label: techLabels[c], hours: rule.hours });
    if (rule.risk && rule.risk !== 'low') risk.push({ id: `tech:${c}`, level: rule.risk, text: T(`技術限制：${techLabels[c].zh}`, `Technical constraint: ${techLabels[c].en}`) });
    if (rule.unknown) unknowns.push({ id: `tech:${c}`, impact: 'medium', text: T('其他技術限制的細節', 'Details of other technical constraints') });
  }
  const techHours = sum(techDetail, (d) => d.hours);
  if (techHours > 0) lines.push({ id: 'tech', label: T('技術限制配合', 'Technical constraints'), hours: h(techHours), detail: techDetail });
  if ((a.techConstraints || []).includes('unsure')) unknowns.push({ id: 'techConstraints', impact: 'medium', text: T('技術或系統限制', 'Technical or system constraints') });

  // 11. Content readiness ----------------------------------------------------
  const content = rules.content[a.contentReadiness];
  let contentHours = 0;
  if (content) {
    contentHours = (designCore * content.pct) / 100;
    const label = QUESTIONS.contentReadiness.options.find((x) => x.id === a.contentReadiness).label;
    if (contentHours > 0) lines.push({ id: 'content', label: T('內容準備', 'Content readiness'), note: T(`${label.zh}：設計工時 × ${content.pct}%`, `${label.en}: design effort × ${content.pct}%`), hours: h(contentHours) });
    if (content.risk && content.risk !== 'low') risk.push({ id: 'content', level: content.risk, text: T(`內容準備：${label.zh}`, `Content: ${label.en}`) });
  }
  if (a.contentReadiness === 'unsure') unknowns.push({ id: 'contentReadiness', impact: 'high', text: T('內容準備程度', 'Content readiness') });
  if (a.contentReadiness === 'ready') assumptions.push({ id: 'content', text: T('文字、圖片與產品資料由委託方提供', 'Text, images and product information are provided by the client') });

  // 12. Project overhead -----------------------------------------------------
  const overhead = fns.length ? rules.projectOverhead.hours : 0;
  if (overhead > 0) lines.unshift({ id: 'overhead', label: T('專案啟動與交付', 'Kickoff and handoff'), hours: overhead });

  const subtotal = overhead + designCore + respHours + existingHours + techHours + contentHours;

  // 13. Coordination ---------------------------------------------------------
  let coordScore = 0;
  coordScore += { 1: 0, 2: 1, '3plus': 2, unsure: 1 }[a.approvalLayers] ?? 0;
  coordScore += { me: 0, manager: 0, management: 1, committee: 2, unsure: 1 }[a.decider] ?? 0;
  const collab = (a.collabRoles || []).filter((x) => x !== 'none');
  if (collab.length >= 4) coordScore += 1;
  const coordination = coordScore >= 3 ? 'heavy' : coordScore >= 1 ? 'moderate' : 'light';
  const coordPct = rules.coordination[`${coordination}Pct`] || 0;
  const coordHours = (subtotal * coordPct) / 100;
  if (coordHours > 0) {
    lines.push({
      id: 'coordination',
      label: T('環境／協調', 'Environment / coordination'),
      note: T(`協調程度：${COORDINATION_LABEL[coordination].zh}（${coordPct}%）`, `Coordination: ${COORDINATION_LABEL[coordination].en.toLowerCase()} (${coordPct}%)`),
      hours: h(coordHours),
    });
  }
  if (coordination === 'heavy') risk.push({ id: 'coordination', level: 'medium', text: T('決策者多或審核層級多', 'Several decision-makers or approval steps') });
  if (a.decider === 'unsure' || a.approvalLayers === 'unsure') unknowns.push({ id: 'approvals', impact: 'medium', text: T('最終決策與審核方式', 'Final decision and approval structure') });

  // 14. Custom requirements --------------------------------------------------
  const custom = inputs.custom || [];
  const pendingCustom = custom.filter((c) => !c.included || c.hours == null);
  const includedCustom = custom.filter((c) => c.included && c.hours != null);
  const customHours = sum(includedCustom, (c) => c.hours);
  if (customHours > 0) {
    lines.push({
      id: 'custom',
      label: T('設計師評估的額外需求', 'Additional requirements (designer estimated)'),
      hours: h(customHours),
      detail: includedCustom.map((c) => ({ label: T(c.name, c.name), hours: c.hours })),
    });
  }
  for (const c of pendingCustom) {
    unknowns.push({ id: `custom:${c.id}`, impact: 'high', text: T(`額外需求待評估：${c.name}`, `Additional requirement to review: ${c.name}`) });
  }
  if (pendingCustom.length) {
    risk.push({ id: 'custom', level: pendingCustom.length >= 2 ? 'high' : 'medium', text: T(`${pendingCustom.length} 項需求超出標準估算模型`, `${pendingCustom.length} requirement(s) outside the standard model`) });
  }

  // Goals not yet clear
  if ((inputs.goals || []).includes('unsure') && !(inputs.improve || []).length) {
    unknowns.push({ id: 'goals', impact: 'high', text: T('使用者要完成的主要事情', 'What users mainly need to do') });
  }

  const point = subtotal + coordHours + customHours;

  // Screens / states / variations (derived, never priced per screen) --------
  const baseScreens = sum(fns, (f) => spec(f).screens);
  const roleScreens = Math.round(sum(roleFns, (f) => spec(f).screens) * roleScreenFactor * extraRoles);
  const screens = baseScreens + roleScreens;
  const stateFactor = statusLevel === 'many' ? rules.states.manyStateFactor : statusLevel === 'few' ? rules.states.fewStateFactor : 0;
  const states = sum(fns, (f) => spec(f).states) + Math.round(sum(statefulFns, (f) => spec(f).states) * stateFactor) + exceptionCount * 2;
  const breakpoints = devices === 'multi' ? 3 : devices === 'both' ? 2 : 1;
  const flows = flowGoals.length || (fns.length ? 1 : 0);

  // Schedule pressure -------------------------------------------------------
  const schedule = scheduleFor(a, point, pricing, asOf, rules);
  if (schedule.pressure === 'high') risk.push({ id: 'schedule', level: 'medium', text: T('時程緊湊', 'Tight schedule') });
  if (schedule.pressure === 'veryHigh') risk.push({ id: 'schedule', level: 'high', text: T('時程非常緊湊', 'Very tight schedule') });
  if (a.deadline === 'unsure') unknowns.push({ id: 'deadline', impact: 'medium', text: T('期望完成時間', 'Target completion date') });

  // Confidence (information certainty) --------------------------------------
  const confidence = confidenceFor(inputs, unknowns);

  const highUnknownCount = unknowns.filter((u) => u.impact === 'high').length;
  if (highUnknownCount >= 3) risk.push({ id: 'unknowns', level: 'high', text: T(`${highUnknownCount} 個高影響未知項`, `${highUnknownCount} high-impact unknowns`) });
  else if (highUnknownCount >= 1) risk.push({ id: 'unknowns', level: 'medium', text: T(`${highUnknownCount} 個高影響未知項`, `${highUnknownCount} high-impact unknown(s)`) });

  const riskLevel = riskLevelFor(risk);

  // Effort range from confidence --------------------------------------------
  const [below, above] = pricing.spreads[confidence.level];
  const effort = {
    point: Math.round(point),
    min: Math.max(0, Math.round(point * (1 - below / 100))),
    max: Math.round(point * (1 + above / 100)),
  };

  if (a.engineering === 'designOnly') assumptions.push({ id: 'engineering', text: T('本估算僅包含設計，開發由委託方團隊負責', 'Design only; development is handled by the client\'s team') });
  if (a.engineering === 'needDev') assumptions.push({ id: 'engineering', text: T('工程開發費用由設計師另行評估', 'Development fees are estimated separately by the designer') });
  if (a.engineering === 'unsure') unknowns.push({ id: 'engineering', impact: 'medium', text: T('是否需要協助工程開發', 'Whether development support is needed') });

  const ctx = { risk: riskLevel, schedule: schedule.pressure, coordination, content: a.contentReadiness };
  const price = priceFor(effort, ctx, pricing, pricing.hourlyRate, []);

  return {
    lines,
    effort,
    counts: { functions: fns.length, flows, screens, states, variations: screens * breakpoints, breakpoints, roles: 1 + extraRoles, custom: custom.length },
    risk: { level: riskLevel, signals: risk },
    schedule,
    coordination,
    confidence,
    unknowns,
    assumptions,
    custom: { pending: pendingCustom, included: includedCustom },
    deliverables: defaultDeliverables({ flows, screens, states, devices, engineering: a.engineering, content: a.contentReadiness }),
    price,
    ctx,
  };
}

export function scheduleFor(a, effortHours, pricing, asOf, rules) {
  const capacity = pricing.weeklyCapacity || 25;
  let weeks = null;
  if (DEADLINE_WEEKS[a.deadline]) weeks = DEADLINE_WEEKS[a.deadline];
  if (a.deadline === 'date' && a.deadlineDate) weeks = weeksBetween(asOf, a.deadlineDate);
  if (weeks == null) {
    const pressure = a.deadline === 'flexible' ? 'low' : null;
    return { pressure, weeks: null, pace: null, capacity, minWeeks: Math.ceil(effortHours / capacity) };
  }
  const pace = weeks > 0 ? effortHours / weeks : Infinity;
  const ratio = pace / capacity;
  const pressure = weeks < 1 ? 'veryHigh' : ratio <= 0.6 ? 'low' : ratio <= 0.9 ? 'medium' : ratio <= 1.2 ? 'high' : 'veryHigh';
  return { pressure, weeks: Math.round(weeks * 10) / 10, pace: Math.round(pace * 10) / 10, capacity, minWeeks: Math.ceil(effortHours / capacity) };
}

export function riskLevelFor(signals) {
  if (signals.some((s) => s.level === 'high')) return 'high';
  const medium = signals.filter((s) => s.level === 'medium').length;
  if (medium >= 3) return 'high';
  if (medium >= 1) return 'medium';
  return 'low';
}

// High-impact questions that must be answered for a confident estimate.
const CONFIDENCE_QUESTIONS = ['goals', 'improve', 'currentState', 'roles', 'integrations', 'contentReadiness', 'deadline'];

export function confidenceFor(inputs, unknowns) {
  const a = { ...(inputs.answers || {}), goals: inputs.goals, improve: inputs.improve };
  const visible = CONFIDENCE_QUESTIONS.filter((q) => isVisible(q, a));
  const answered = visible.filter((q) => {
    const v = a[q];
    return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
  });
  const fns = inputs.functions || [];
  const total = visible.length + 2; // + scope + levels
  let done = answered.length;
  if (fns.length) done += 1;
  if (fns.length && fns.every((f) => f.level && f.levelChosen !== false)) done += 1;
  const coverage = total ? done / total : 0;
  const high = unknowns.filter((u) => u.impact === 'high');
  let level = 'low';
  if (coverage >= 0.999 && high.length === 0) level = 'high';
  else if (coverage >= 0.7 && high.length <= 2) level = 'medium';

  const reasons = [];
  if (fns.length) reasons.push(T(`已確認 ${fns.length} 項主要功能`, `${fns.length} main functions confirmed`));
  if (coverage < 0.999) reasons.push(T(`關鍵問題已回答 ${Math.round(coverage * 100)}%`, `${Math.round(coverage * 100)}% of key questions answered`));
  if (high.length) {
    reasons.push(T(
      `仍有 ${high.length} 個高影響未知項：${high.map((u) => u.text.zh).join('、')}`,
      `${high.length} high-impact unknown(s) remain: ${high.map((u) => u.text.en).join('; ')}`,
    ));
  } else if (coverage >= 0.999) {
    reasons.push(T('沒有尚未釐清的高影響項目', 'No unresolved high-impact items'));
  }
  return { level, coverage, highUnknowns: high.length, reasons };
}

function triggerMatches(trigger, ctx) {
  switch (trigger) {
    case 'always': return true;
    case 'schedule:high': return ctx.schedule === 'high';
    case 'schedule:veryHigh': return ctx.schedule === 'veryHigh';
    case 'risk:medium': return ctx.risk === 'medium' || ctx.risk === 'high';
    case 'risk:high': return ctx.risk === 'high';
    case 'coordination:moderate': return ctx.coordination === 'moderate' || ctx.coordination === 'heavy';
    case 'coordination:heavy': return ctx.coordination === 'heavy';
    case 'content:designerHelp': return ctx.content === 'designerHelp';
    default: return false;
  }
}

/**
 * Hours × rate = base price; + designer-defined adjustments = final price.
 * `manual` adjustments are ones the designer added to a specific estimate version.
 */
export function priceFor(effort, ctx, pricing, rate, manual = [], ignored = []) {
  const base = { min: effort.min * rate, max: effort.max * rate };
  const rulesApplied = (pricing.adjustments || []).filter((r) => r.enabled && !ignored.includes(r.id) && triggerMatches(r.trigger, ctx));
  const all = [...rulesApplied.map((r) => ({ ...r, source: 'rule' })), ...manual.map((m) => ({ ...m, source: 'manual' }))];
  const adjustments = all.map((r) => {
    const value = Number(r.value) || 0;
    const amount = r.kind === 'fixed' ? { min: value, max: value } : { min: (base.min * value) / 100, max: (base.max * value) / 100 };
    return { id: r.id, name: r.name, kind: r.kind, value, trigger: r.trigger, source: r.source, amount };
  });
  let min = base.min + sum(adjustments, (x) => x.amount.min);
  let max = base.max + sum(adjustments, (x) => x.amount.max);
  let minimumApplied = false;
  if (min < pricing.minimumFee) {
    min = pricing.minimumFee;
    minimumApplied = true;
  }
  if (max < min) max = min;
  return {
    rate,
    base,
    adjustments,
    total: { min: roundTo(min, pricing.rounding), max: roundTo(max, pricing.rounding) },
    minimumApplied,
  };
}

export function defaultDeliverables({ flows, screens, states, devices, engineering, content }) {
  const list = [];
  if (flows) list.push(T(`使用者流程圖：${flows} 個主要流程`, `User flows: ${flows} main flows`));
  if (screens) list.push(T(`介面設計：約 ${screens} 個畫面、${states} 種狀態`, `Interface design: about ${screens} screens and ${states} states`));
  if (devices === 'both' || devices === 'multi') list.push(T('桌機與手機版設計', 'Desktop and mobile layouts'));
  else if (devices === 'desktop') list.push(T('桌機版設計與基本響應式規則', 'Desktop layouts with basic responsive rules'));
  else if (devices === 'mobile') list.push(T('手機版設計與基本響應式規則', 'Mobile layouts with basic responsive rules'));
  if (screens) list.push(T('主要流程的可互動原型', 'Clickable prototype of the main flows'));
  if (screens) list.push(T('設計規格與交付檔案（Figma）', 'Design specifications and handoff files (Figma)'));
  if (content === 'designerHelp') list.push(T('內容架構與文案結構建議', 'Content structure and copy outline'));
  if (engineering === 'needDev') list.push(T('開發需求說明（Developer Brief）', 'Developer brief'));
  return list;
}

// ---------------------------------------------------------------------------
// Information value: which unanswered questions could still move the estimate?
// We re-run the engine once per possible answer and measure the spread.

export function informationValue(inputs, snapshot, opts = {}) {
  const base = estimate(inputs, snapshot, opts).effort.point || 1;
  const results = [];
  const a = { ...(inputs.answers || {}) };
  const ctxAnswers = { ...a, goals: inputs.goals, improve: inputs.improve };
  for (const [qid, q] of Object.entries(QUESTIONS)) {
    if (!['single', 'multi'].includes(q.type)) continue;
    if (['goals', 'improve', 'collabRoles'].includes(qid)) continue;
    if (!isVisible(qid, ctxAnswers)) continue;
    const current = a[qid];
    if (current != null && !(Array.isArray(current) && !current.length)) continue;
    const points = q.options
      .filter((o) => o.id !== 'other')
      .map((o) => estimate({ ...inputs, answers: { ...a, [qid]: q.type === 'multi' ? [o.id] : o.id } }, snapshot, opts).effort.point);
    const spread = Math.max(...points) - Math.min(...points);
    results.push({ qid, spread, value: spread / base });
  }
  for (const f of inputs.functions || []) {
    if (f.level !== 'unsure') continue;
    const def = snapshot.functions.find((x) => x.id === f.fnId);
    if (!def) continue;
    const spread = def.advanced.effort - def.basic.effort;
    results.push({ qid: `level:${f.fnId}`, spread, value: spread / base });
  }
  return results.sort((x, y) => y.value - x.value);
}

/** The estimate is stable when no remaining question can move it by more than `threshold`. */
export function isEstimateStable(inputs, snapshot, threshold = 0.05, opts = {}) {
  const values = informationValue(inputs, snapshot, opts);
  return { stable: values.every((v) => v.value < threshold), values };
}

export function goalLabel(id) {
  return GOALS.find((g) => g.id === id)?.label || T(id, id);
}
