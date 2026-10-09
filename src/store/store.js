// Designer workspace store: one immutable state tree, persisted locally.
import { useSyncExternalStore } from 'react';
import { storage } from './storage.js';
import { starterBaseline } from '../data/baseline.js';
import { starterPricing } from '../data/pricing.js';
import { starterTemplates } from '../data/contracts.js';

export const SCHEMA = 1;

export function defaultSettings() {
  return {
    designer: { name: '', studio: '', email: '', phone: '', address: '', taxId: '' },
    appUrl: '',
    inviteExpiryDays: 30,
    jurisdiction: { zh: '中華民國', en: 'Taiwan (R.O.C.)' },
    baseline: starterBaseline(),
    pricing: starterPricing(),
    contracts: {
      templates: starterTemplates(),
      defaultTemplateId: 'uxui-standard',
      defaultIp: 'assignment',
      defaultPortfolio: 'approval',
    },
  };
}

function initialState() {
  const saved = storage.loadWorkspace();
  if (saved && saved.schema === SCHEMA) {
    // Fill settings added in later builds without touching saved values.
    const defaults = defaultSettings();
    return { ...saved, settings: { ...defaults, ...saved.settings } };
  }
  return { schema: SCHEMA, settings: defaultSettings(), projects: {}, createdAt: new Date().toISOString() };
}

let state = initialState();
const listeners = new Set();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.saveWorkspace(state), 150);
}

export function getState() {
  return state;
}

export function setState(updater) {
  const next = typeof updater === 'function' ? updater(state) : updater;
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function replaceState(next) {
  state = next;
  storage.saveWorkspace(state);
  listeners.forEach((l) => l());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Select a slice. Selectors must return existing references (no new objects). */
export function useStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function flushNow() {
  clearTimeout(saveTimer);
  storage.saveWorkspace(state);
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushNow);
