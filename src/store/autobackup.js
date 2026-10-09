// Automatic backup to a folder on the designer's computer.
//
// The workspace lives in the browser. This module writes a copy of it to a folder
// the designer chooses (ideally one that is already synced or backed up), every
// time something changes. If the browser's data is ever cleared, the workspace can
// be restored from that folder.
//
// Files written to the folder:
//   scopebook-workspace.json          always the latest state
//   scopebook-backup-YYYY-MM-DD.json  one per day (that day's last state), kept
//
// Uses the File System Access API (Chrome, Edge). Other browsers fall back to the
// manual "Download backup" button.
import { useSyncExternalStore } from 'react';
import { getState, subscribe as subscribeStore, SCHEMA } from './store.js';

export const LATEST_FILE = 'scopebook-workspace.json';
const DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Remember the chosen folder between visits (folder handles can be kept in IndexedDB)

const DB_NAME = 'sb-autobackup';
const STORE = 'handles';

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const loadHandle = () => idb('readonly', (s) => s.get('dir')).catch(() => null);
const saveHandle = (h) => idb('readwrite', (s) => s.put(h, 'dir'));
const clearHandle = () => idb('readwrite', (s) => s.delete('dir'));

// ---------------------------------------------------------------------------
// Status, observable from React

export const supported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

let status = {
  state: supported ? 'loading' : 'unsupported', // unsupported | loading | off | on | needsPermission | error
  folderName: '',
  lastSavedAt: null,
  error: '',
};
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useAutoBackup() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

let dir = null;

async function permission(handle, request) {
  if (!handle.queryPermission) return 'granted';
  const opts = { mode: 'readwrite' };
  let p = await handle.queryPermission(opts);
  if (p !== 'granted' && request) p = await handle.requestPermission(opts);
  return p;
}

async function writeFile(name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

export async function writeNow() {
  if (!dir || status.state !== 'on') return;
  // An empty workspace is never written over a backup. This is what protects you if the
  // browser's storage is wiped while the folder connection survives: the backup stays intact.
  if (!Object.keys(getState().projects || {}).length) return;
  try {
    const now = new Date();
    const text = JSON.stringify({ ...getState(), backedUpAt: now.toISOString() }, null, 2);
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await writeFile(LATEST_FILE, text);
    await writeFile(`scopebook-backup-${day}.json`, text);
    setStatus({ lastSavedAt: now.toISOString(), error: '' });
  } catch (err) {
    console.error('Auto backup failed', err);
    const lost = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    setStatus(lost ? { state: 'needsPermission' } : { state: 'error', error: String(err?.message || err) });
  }
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(writeNow, DEBOUNCE_MS);
}

let started = false;
/** Call once when the workspace opens. */
export async function initAutoBackup() {
  if (started || !supported) return;
  started = true;
  subscribeStore(() => {
    if (status.state === 'on') schedule();
  });
  window.addEventListener('pagehide', () => {
    if (timer) writeNow();
  });
  const handle = await loadHandle();
  if (!handle) return setStatus({ state: 'off' });
  dir = handle;
  const p = await permission(handle, false).catch(() => 'denied');
  if (p === 'granted') {
    setStatus({ state: 'on', folderName: handle.name });
    writeNow();
  } else {
    setStatus({ state: 'needsPermission', folderName: handle.name });
  }
}

/** Choose a folder (must be called from a click). */
export async function connectFolder() {
  const handle = await window.showDirectoryPicker({ id: 'scopebook-backup', mode: 'readwrite' });
  if ((await permission(handle, true)) !== 'granted') throw new Error('permission');
  dir = handle;
  await saveHandle(handle);
  setStatus({ state: 'on', folderName: handle.name, error: '' });
  await writeNow();
}

/** After the browser restarts it may ask once more (must be called from a click). */
export async function resumeBackup() {
  if (!dir) return connectFolder();
  if ((await permission(dir, true)) !== 'granted') return;
  setStatus({ state: 'on', error: '' });
  await writeNow();
}

export async function stopBackup() {
  dir = null;
  await clearHandle();
  setStatus({ state: 'off', folderName: '', lastSavedAt: null, error: '' });
}

/** Read the latest workspace from a backup folder the designer picks. */
export async function readFromFolder() {
  const handle = await window.showDirectoryPicker({ id: 'scopebook-backup', mode: 'readwrite' });
  let file;
  try {
    file = await (await handle.getFileHandle(LATEST_FILE)).getFile();
  } catch {
    throw new Error('notFound');
  }
  const data = JSON.parse(await file.text());
  if (data.schema !== SCHEMA || !data.settings || !data.projects) throw new Error('format');
  delete data.backedUpAt;
  return { data, handle };
}

/** After a restore, keep backing up to the same folder. */
export async function backUpToFolder(handle) {
  if ((await permission(handle, true)) !== 'granted') return;
  dir = handle;
  await saveHandle(handle);
  setStatus({ state: 'on', folderName: handle.name, error: '' });
  await writeNow();
}
