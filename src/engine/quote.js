// Quote snapshots. A quote is an immutable copy of what was promised,
// referencing the exact estimate version it came from.
import { GOALS, IMPROVEMENTS } from '../data/baseline.js';
import { QUESTIONS } from '../data/questionnaire.js';
import { LEVEL_LABEL, levelSpec } from './estimate.js';
import { answerText, effectiveEstimate } from './versions.js';
import { addDays, clone, nowIso, uid } from '../lib/util.js';

const T = (zh, en) => ({ zh, en });

const UNDERSTANDING_QUESTIONS = ['currentState', 'approach', 'currentNote', 'roles', 'roleDiff', 'devices', 'integrations', 'techConstraints', 'contentReadiness', 'deadline', 'deadlineDate', 'engineering'];

export function understandingOf(answers) {
  return UNDERSTANDING_QUESTIONS.filter((q) => answers[q] != null && answers[q] !== '' && !(Array.isArray(answers[q]) && !answers[q].length)).map((q) => ({
    q: QUESTIONS[q].title,
    a: answerText(q, answers[q]),
  }));
}

export function objectivesOf(inputs) {
  const answers = inputs.answers || {};
  return [
    ...(inputs.goals || []).filter((g) => !['other', 'unsure'].includes(g)).map((g) => GOALS.find((x) => x.id === g)?.label).filter(Boolean),
    ...(answers.goalsOther ? [T(answers.goalsOther, answers.goalsOther)] : []),
    ...(inputs.improve || []).filter((i) => i !== 'other').map((i) => IMPROVEMENTS.find((x) => x.id === i)?.label).filter(Boolean),
    ...(answers.improveOther ? [T(answers.improveOther, answers.improveOther)] : []),
  ];
}

/**
 * @param version  estimate version (or a pseudo-version for the client's preliminary quote)
 * @param meta     { number, projectName, client, designer }
 * @param terms    { kind, status, fixedPrice, validityDays, revisionRounds, paymentSchedule, paymentDueDays, deliverables, exclusions, timelineText, developmentFee, notes }
 */
export function quoteFromVersion(version, meta, terms) {
  const eff = effectiveEstimate(version);
  const pricing = version.snapshot.pricing;
  const fnDefs = Object.fromEntries(version.snapshot.functions.map((f) => [f.id, f]));
  const answers = version.inputs.answers || {};
  const scope = [
    ...version.inputs.functions
      .filter((f) => fnDefs[f.fnId])
      .map((f) => {
        const def = fnDefs[f.fnId];
        return { fnId: f.fnId, name: def.name, level: f.level === 'unsure' ? null : LEVEL_LABEL[f.level].en, included: levelSpec(def, f.level).scope || null };
      }),
    ...(version.inputs.custom || []).filter((c) => c.included).map((c) => ({ fnId: null, name: T(c.name, c.name), level: null, custom: true, note: c.note })),
  ];
  const validityDays = terms.validityDays ?? pricing.quoteValidityDays;
  const createdAt = terms.createdAt || nowIso();
  const mid = Math.round((eff.price.total.min + eff.price.total.max) / 2 / (pricing.rounding || 1)) * (pricing.rounding || 1);
  const fixedPrice = terms.kind === 'final' ? Number(terms.fixedPrice ?? eff.fixedPrice ?? mid) : null;
  return {
    id: uid('q'),
    number: meta.number,
    estimateId: version.id || null,
    estimateNumber: version.number || null,
    kind: terms.kind,
    status: terms.status,
    statusHistory: [{ status: terms.status, at: createdAt }],
    createdAt,
    validUntil: addDays(createdAt, validityDays),
    validityDays,
    currencySymbol: pricing.currencySymbol,
    projectName: meta.projectName,
    client: clone(meta.client || {}),
    designer: clone(meta.designer || {}),
    objectives: objectivesOf(version.inputs),
    understanding: understandingOf(answers),
    scope,
    pendingCustom: (version.inputs.custom || []).filter((c) => !c.included).map((c) => ({ name: c.name, note: c.note })),
    deliverables: clone(terms.deliverables || eff.deliverables),
    counts: { ...eff.system.counts, screens: eff.screens, states: eff.states },
    effort: eff.effort,
    price: eff.price.total,
    priceBreakdown: { rate: eff.rate, base: eff.price.base, adjustments: eff.price.adjustments, minimumApplied: eff.price.minimumApplied },
    fixedPrice,
    developmentFee: terms.developmentFee ?? eff.developmentFee,
    timelineText: clone(terms.timelineText || eff.timelineText),
    revisionRounds: terms.revisionRounds ?? pricing.revisionRounds,
    exclusions: clone(terms.exclusions || eff.exclusions),
    assumptions: eff.assumptions.map((x) => x.text),
    unknowns: eff.unknowns.map((x) => x.text),
    confidence: eff.confidence,
    confidenceReasons: eff.system.confidence.reasons,
    risk: eff.risk,
    schedule: eff.schedule,
    paymentSchedule: clone(terms.paymentSchedule || pricing.paymentSchedule),
    paymentDueDays: terms.paymentDueDays ?? pricing.paymentDueDays,
    notes: terms.notes || '',
    engineering: answers.engineering || null,
  };
}
