// On-screen preview of a document, page by page, exactly as the PDF will paginate.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { downloadPdf, ensureDocumentStyle, previewPages } from '../documents/export.js';
import { Modal, toast } from './ui.jsx';

const PAGE_W = 794;

function PdfPreviewModal({ doc, onClose, onDownloaded }) {
  const { t } = useI18n();
  const [pages, setPages] = useState(null);
  const [scale, setScale] = useState(0.8);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    ensureDocumentStyle();
    // Fonts first, so line breaks match the downloaded file.
    (document.fonts?.ready || Promise.resolve()).then(() => setPages(previewPages(doc)));
  }, [doc]);

  useLayoutEffect(() => {
    const fit = () => {
      const w = boxRef.current?.clientWidth || PAGE_W;
      setScale(Math.min(1, (w - 32) / PAGE_W));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      await downloadPdf(doc);
      onDownloaded?.();
    } catch (err) {
      console.error(err);
      toast(t('doc.pdfFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={doc.title}
      onClose={onClose}
      actions={
        <>
          <span className="small muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {pages ? t('doc.pageCount', { n: pages.length }) : t('common.loading')}
          </span>
          <button className="btn" onClick={onClose}>{t('common.close')}</button>
          <button className="btn primary" onClick={download} disabled={busy}>{busy ? t('doc.preparing') : t('contract.downloadPdf')}</button>
        </>
      }
    >
      <div ref={boxRef} className="pdf-preview" aria-label={t('doc.preview')}>
        {pages?.map((html, i) => (
          <div key={i} className="pdf-preview-page" style={{ width: PAGE_W * scale, height: 1123 * scale }}>
            <div className="sbdoc" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: PAGE_W }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** const [openPreview, previewEl] = usePdfPreview(); … openPreview(() => buildDoc()) */
export function usePdfPreview() {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const open = (build, onDownloaded) => {
    try {
      setState({ doc: build(), onDownloaded });
    } catch (err) {
      console.error(err);
      toast(t('doc.pdfFailed'));
    }
  };
  const el = state ? <PdfPreviewModal doc={state.doc} onDownloaded={state.onDownloaded} onClose={() => setState(null)} /> : null;
  return [open, el];
}
