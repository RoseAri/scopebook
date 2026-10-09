// GitHub Pages serves index.html at the site address, so the client page is renamed.
import { existsSync, renameSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-client/', import.meta.url);
const from = new URL('client.html', dir);
const to = new URL('index.html', dir);
if (!existsSync(from)) {
  console.error('dist-client/client.html not found. Run "npm run build:client".');
  process.exit(1);
}
renameSync(from, to);
writeFileSync(new URL('.nojekyll', dir), '');
console.log('Client site ready in dist-client/');
