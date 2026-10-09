// Compact snapshots for links and return codes. The app bundle already contains
// the starter baseline, so functions that still match it are sent as a reference
// ({ ref: id }) instead of in full. Edited or custom functions travel complete.
import { STARTER_FUNCTIONS } from '../data/baseline.js';

const starterById = Object.fromEntries(STARTER_FUNCTIONS.map((f) => [f.id, f]));
const strip = (f) => {
  const { starter, ...rest } = f; // eslint-disable-line no-unused-vars
  return rest;
};
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

export function packSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  return {
    ...snapshot,
    functions: snapshot.functions.map((f) => (starterById[f.id] && same(f, starterById[f.id]) ? { ref: f.id } : strip(f))),
  };
}

export function unpackSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  return {
    ...snapshot,
    functions: snapshot.functions
      .map((f) => (f.ref ? (starterById[f.ref] ? JSON.parse(JSON.stringify(strip(starterById[f.ref]))) : null) : f))
      .filter(Boolean),
  };
}
