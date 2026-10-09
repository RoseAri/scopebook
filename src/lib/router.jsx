// Minimal hash router. Hash routing keeps the app deployable on any static host
// and keeps invitation payloads out of server logs (the hash is never sent).
import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query), raw };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path) {
  window.location.hash = path;
}

/** Match "/projects/:id/:tab?" style patterns. Returns params or null. */
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const params = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    const optional = seg.endsWith('?');
    const name = seg.replace(/^:/, '').replace(/\?$/, '');
    if (seg.startsWith(':')) {
      if (s[i] == null) {
        if (optional) continue;
        return null;
      }
      params[name] = decodeURIComponent(s[i]);
    } else if (seg !== s[i]) {
      return null;
    }
  }
  if (s.length > p.length) return null;
  return params;
}

export function Link({ to, children, current, ...rest }) {
  return (
    <a href={`#${to}`} aria-current={current ? 'page' : undefined} {...rest}>
      {children}
    </a>
  );
}
