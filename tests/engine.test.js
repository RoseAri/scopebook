import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starterBaseline } from '../src/data/baseline.js';
import { starterPricing } from '../src/data/pricing.js';
import { estimate, suggestedFunctionIds, validationSuggestion, informationValue, priceFor } from '../src/engine/estimate.js';
import { effectiveEstimate, diffVersions, checkConsistency } from '../src/engine/versions.js';

const baseline = starterBaseline();
const snapshot = { functions: baseline.functions, rules: baseline.rules, pricing: starterPricing() };
const asOf = '2026-10-06T00:00:00.000Z';

const purchaseInputs = () => ({
  goals: ['purchase'],
  improve: [],
  functions: suggestedFunctionIds(['purchase'], [], baseline.functions).map((fnId) => ({ fnId, level: 'basic' })),
  custom: [],
  flows: {},
  answers: { currentState: 'none', roles: '1', integrations: ['payment'], contentReadiness: 'ready', deadline: '2-3m', devices: 'both' },
});

test('purchase goal suggests the standard purchase functions', () => {
  const ids = suggestedFunctionIds(['purchase'], [], baseline.functions);
  for (const id of ['item-detail', 'item-select', 'cart', 'checkout', 'payment', 'order-confirm', 'order-history']) assert.ok(ids.includes(id), id);
});

test('estimate is explainable: lines add up to the point estimate', () => {
  const r = estimate(purchaseInputs(), snapshot, { asOf });
  const total = r.lines.reduce((n, l) => n + l.hours, 0);
  assert.ok(Math.abs(total - r.effort.point) <= 1, `${total} vs ${r.effort.point}`);
  assert.ok(r.effort.min < r.effort.point && r.effort.point < r.effort.max);
  assert.equal(r.confidence.level, 'high');
  assert.equal(r.risk.level, 'low');
});

test('complexity only adds effort when matching functions exist', () => {
  const inputs = purchaseInputs();
  inputs.answers.specialCases = ['approvals']; // no approval functions in a purchase scope
  const r = estimate(inputs, snapshot, { asOf });
  assert.equal(r.lines.find((l) => l.id === 'exceptions'), undefined);
  inputs.answers.specialCases = ['cancel'];
  const r2 = estimate(inputs, snapshot, { asOf });
  assert.ok(r2.lines.find((l) => l.id === 'exceptions'));
});

test('custom requirements are never priced automatically', () => {
  const inputs = purchaseInputs();
  const before = estimate(inputs, snapshot, { asOf }).effort.point;
  inputs.custom = [{ id: 'c1', name: 'ERP integration', hours: null, included: false }];
  const r = estimate(inputs, snapshot, { asOf });
  assert.equal(r.effort.point, before);
  assert.equal(r.custom.pending.length, 1);
  assert.ok(r.unknowns.some((u) => u.id === 'custom:c1' && u.impact === 'high'));
  assert.notEqual(r.confidence.level, 'high');
});

test('validation suggests Basic when Advanced has no advanced signals', () => {
  const login = baseline.functions.find((f) => f.id === 'login');
  assert.equal(validationSuggestion(login, 'advanced', ['password']), 'basic');
  assert.equal(validationSuggestion(login, 'advanced', ['password', '2fa']), null);
  assert.equal(validationSuggestion(login, 'basic', ['social']), 'advanced');
});

test('schedule pressure comes from pace vs weekly capacity, not a fixed rush fee', () => {
  const inputs = purchaseInputs();
  inputs.answers.deadline = '1m';
  const r = estimate(inputs, snapshot, { asOf });
  assert.ok(['medium', 'high', 'veryHigh', 'low'].includes(r.schedule.pressure));
  assert.equal(r.price.adjustments.length, 0, 'rush rules are off until the designer enables them');
});

test('minimum fee applies', () => {
  const p = priceFor({ min: 2, max: 3 }, {}, snapshot.pricing, 2000, []);
  assert.equal(p.total.min, snapshot.pricing.minimumFee);
  assert.ok(p.minimumApplied);
});

test('information value finds questions that still move the estimate', () => {
  const inputs = purchaseInputs();
  delete inputs.answers.roles;
  inputs.answers.dataVolume = undefined;
  const values = informationValue(inputs, snapshot, { asOf });
  assert.ok(values.length > 0);
  assert.ok(values[0].value >= values[values.length - 1].value);
});

test('versions: overrides sit on top of the system estimate and diffs are reported', () => {
  const v1 = { id: 'v1', createdAt: asOf, inputs: purchaseInputs(), snapshot, overrides: {} };
  const v2 = JSON.parse(JSON.stringify(v1));
  v2.inputs.functions.push({ fnId: 'login', level: 'advanced' });
  v2.overrides = { rate: 2500 };
  const e1 = effectiveEstimate(v1);
  const e2 = effectiveEstimate(v2);
  assert.equal(e2.rate, 2500);
  assert.equal(e2.system.effort.point > e1.system.effort.point, true);
  const names = Object.fromEntries(baseline.functions.map((f) => [f.id, f.name]));
  const changes = diffVersions(v1, v2, names);
  assert.ok(changes.some((c) => c.kind === 'added'));
  assert.ok(changes.some((c) => c.label.en === 'Price'));
});

test('contract consistency check flags missing quote facts', () => {
  const res = checkConsistency('Client: Acme. Fee NT$175,000', [
    { id: 'client', expected: ['Acme'] },
    { id: 'price', expected: ['NT$175,000'] },
    { id: 'scope', expected: ['Checkout'] },
  ]);
  assert.deepEqual(res.map((r) => r.ok), [true, true, false]);
});
