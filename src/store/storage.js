// Persistence adapter. Everything goes through this module so a cloud backend
// (database + authentication) can replace browser storage later without
// touching screens or the estimation engine.

const WORKSPACE_KEY = 'sb.workspace.v1';
const LANG_KEY = 'sb.lang';
const CLIENT_PREFIX = 'sb.client.';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('Storage write failed', err);
    return false;
  }
}

export const storage = {
  loadWorkspace: () => read(WORKSPACE_KEY),
  saveWorkspace: (state) => write(WORKSPACE_KEY, state),
  clearWorkspace: () => localStorage.removeItem(WORKSPACE_KEY),

  loadLang: () => {
    try {
      return localStorage.getItem(LANG_KEY);
    } catch {
      return null;
    }
  },
  saveLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* private mode: keep the in-memory choice */
    }
  },

  // Client sessions live in the client's own browser, keyed by invitation token.
  loadClientSession: (token) => read(CLIENT_PREFIX + token),
  saveClientSession: (token, session) => write(CLIENT_PREFIX + token, session),
  listClientSessions: () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CLIENT_PREFIX)) {
          const s = read(key);
          if (s) out.push(s);
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  },

  usageBytes: () => {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        n += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch {
      /* ignore */
    }
    return n * 2;
  },
};
