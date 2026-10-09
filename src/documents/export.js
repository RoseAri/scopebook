// Browser-side document output. Kept separate from the templates so it can be
// swapped for server-side PDF generation later.
//
//   downloadPdf  – paginates the blocks onto A4 pages and saves a PDF file
//                  (pages are rendered as images, so Chinese always displays correctly)
//   printDocument – opens the browser's print dialog; "Save as PDF" there gives
//                  a text-selectable vector PDF
import { DOCUMENT_CSS } from './templates.js';
import { downloadBlob, safeFilename } from '../lib/util.js';

const A4 = { w: 794, h: 1123, padTop: 64, padBottom: 96 };
const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap';

function ensureStyle() {
  if (document.getElementById('sbdoc-style')) return;
  const style = document.createElement('style');
  style.id = 'sbdoc-style';
  style.textContent = DOCUMENT_CSS;
  document.head.appendChild(style);
}

/** Lay the blocks out onto fixed-size pages. */
function paginate(doc) {
  ensureStyle();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;';
  document.body.appendChild(host);

  // Measure each block at page width
  const measure = document.createElement('div');
  measure.className = 'sbdoc';
  measure.innerHTML = `<div class="d-page" style="height:auto">${doc.blocks.map((b) => `<div class="d-block">${b}</div>`).join('')}</div>`;
  host.appendChild(measure);
  const blockEls = [...measure.querySelectorAll('.d-block')];
  // Use the distance to the next block so collapsed margins are counted too.
  const tops = blockEls.map((el) => el.getBoundingClientRect().top);
  const heights = blockEls.map((el, i) => (i + 1 < blockEls.length ? tops[i + 1] - tops[i] : el.getBoundingClientRect().height + 24));
  measure.remove();

  const limit = A4.h - A4.padTop - A4.padBottom - 16;
  const pages = [];
  let current = [];
  let used = 0;
  doc.blocks.forEach((b, i) => {
    let hgt = heights[i];
    // Keep headings with the block that follows them
    const isHeadingOnly = /^<h2[^>]*>.*<\/h2>$/s.test(b.trim());
    if (isHeadingOnly && i + 1 < heights.length) hgt += Math.min(heights[i + 1], limit / 3);
    if (used + hgt > limit && current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(b);
    used += heights[i];
  });
  if (current.length) pages.push(current);

  const container = document.createElement('div');
  container.className = 'sbdoc';
  container.innerHTML = pages
    .map(
      (blocks, i) => `<div class="d-page">${doc.watermark ? `<div class="d-mark">${doc.watermark}</div>` : ''}${blocks.map((b) => `<div class="d-block">${b}</div>`).join('')}
        <div class="d-foot"><span>${escapeHtml(doc.footer || doc.title)}</span><span>${i + 1} / ${pages.length}</span></div></div>`,
    )
    .join('');
  host.appendChild(container);
  return { host, pageEls: [...container.querySelectorAll('.d-page')] };
}

/**
 * The exact pages the PDF will contain, as HTML, for an on-screen preview.
 * Uses the same pagination as downloadPdf, so what you see is what you get.
 */
export function previewPages(doc) {
  const { host, pageEls } = paginate(doc);
  const pages = pageEls.map((el) => el.outerHTML);
  host.remove();
  return pages;
}

export function ensureDocumentStyle() {
  ensureStyle();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

let fontCssPromise = null;
/** Embed the Latin web fonts once; Chinese falls back to the system's CJK fonts. */
async function fontEmbedCss() {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      try {
        const css = await (await fetch(FONT_CSS_URL)).text();
        const blocks = css.split('@font-face').slice(1).filter((b) => /latin \*\/|U\+0000-00FF/.test(b) || /unicode-range: U\+0000/.test(b));
        const out = [];
        for (const block of blocks) {
          const url = block.match(/url\((https:[^)]+)\)/)?.[1];
          if (!url) continue;
          const buf = await (await fetch(url)).arrayBuffer();
          let bin = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          out.push(`@font-face${block.replace(url, `data:font/woff2;base64,${btoa(bin)}`)}`);
        }
        return out.join('\n');
      } catch {
        return '';
      }
    })();
  }
  return fontCssPromise;
}

export async function downloadPdf(doc) {
  const [{ toPng }, { PDFDocument }] = await Promise.all([import('html-to-image'), import('pdf-lib')]);
  const fontEmbedCSS = await fontEmbedCss();
  const { host, pageEls } = paginate(doc);
  try {
    const pdf = await PDFDocument.create();
    pdf.setTitle(doc.title);
    pdf.setCreator('Scopebook');
    for (const el of pageEls) {
      const png = await toPng(el, { pixelRatio: 2, backgroundColor: '#fffdf9', fontEmbedCSS: fontEmbedCSS || undefined, skipFonts: !fontEmbedCSS, cacheBust: false });
      const img = await pdf.embedPng(png);
      const page = pdf.addPage([595.28, 841.89]);
      page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }
    const bytes = await pdf.save();
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${safeFilename(doc.filename)}.pdf`);
  } finally {
    host.remove();
  }
}

export function printDocument(doc) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.filename)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Noto+Sans+TC:wght@400;500&family=Noto+Serif+TC:wght@500&display=swap">
    <style>${DOCUMENT_CSS}
      @page { size: A4; margin: 18mm 18mm 20mm; }
      html, body { margin: 0; background: #fff; }
      .sbdoc { width: auto; background: #fff; }
      .d-block { break-inside: avoid; }
      .d-h2 { break-after: avoid; }
    </style></head>
    <body><div class="sbdoc">${doc.blocks.map((b) => `<div class="d-block">${b}</div>`).join('')}</div></body></html>`;
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  iframe.onload = () => (iframe.contentDocument.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 100));
  const idoc = iframe.contentDocument;
  idoc.open();
  idoc.write(html);
  idoc.close();
  setTimeout(go, 4000); // offline fallback: print with system fonts
}
