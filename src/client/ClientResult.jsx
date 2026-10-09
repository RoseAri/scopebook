import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { BasisList, Figures, UnknownList } from '../components/estimate.jsx';
import { toast } from '../components/ui.jsx';
import { encodeReturnCode } from '../lib/codec.js';
import { copyText, downloadText, safeFilename } from '../lib/util.js';
import { quoteFromVersion } from '../engine/quote.js';
import { packSnapshot } from '../engine/snapshot.js';
import { quoteDocument } from '../documents/templates.js';
import { downloadPdf, printDocument } from '../documents/export.js';
import { usePdfPreview } from '../components/PdfPreview.jsx';
import * as S from './session.js';

export function EstimateDrawer({ result, onClose, onFinish }) {
  const { t, tl } = useI18n();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="modal-backdrop" style={{ background: 'rgba(36,31,25,0.18)' }} onClick={onClose} />
      <aside className="estimate-drawer" role="dialog" aria-label={t('client.drawer.title')}>
        <div className="row between">
          <h2 className="section-title">{t('client.drawer.title')}</h2>
          <button className="btn ghost" onClick={onClose}>{t('common.close')}</button>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>{t('client.drawer.hint')}</p>
        <Figures effort={result.effort} price={result.price.total} confidence={result.confidence.level} compact />
        <hr className="hr" />
        <p className="sub-title" style={{ marginBottom: 8 }}>{t('client.result.unknowns')}</p>
        <UnknownList unknowns={result.unknowns.filter((u) => u.impact === 'high')} empty={t('client.result.noHighUnknowns')} />
        <hr className="hr" />
        <p className="small muted">{result.confidence.reasons.map((r) => tl(r)).join(t('common.sentenceSep'))}</p>
        <button className="btn primary" style={{ marginTop: 20 }} onClick={onFinish}>{t('client.drawer.finish')}</button>
      </aside>
    </>
  );
}

export function ResultScreen({ designerProject, invite, session, update, inputs, result, onBack, onEdit }) {
  const { t, tl, lang } = useI18n();
  const [openPreview, previewEl] = usePdfPreview();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const answers = S.answersOf(session);

  const quote = useMemo(() => {
    const pseudoVersion = { id: null, number: null, inputs, snapshot: invite.snapshot, createdAt: new Date().toISOString(), overrides: {} };
    return quoteFromVersion(
      pseudoVersion,
      {
        number: null,
        projectName: invite.projectName,
        client: {},
        designer: invite.designer,
      },
      { kind: 'preliminary', status: 'preliminary' },
    );
  }, [inputs, invite]);

  useEffect(() => {
    if (session.submittedAt) encodeReturnCode({ ...session, snapshotUsed: packSnapshot(session.snapshotUsed) }).then(setCode);
  }, [session]);

  const download = async () => {
    setBusy(true);
    try {
      await downloadPdf(quoteDocument(quote, lang));
      update((s) => S.noteDownload(s));
    } catch (err) {
      console.error(err);
      toast(t('doc.pdfFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => update((s) => S.submit(s));
  const designerName = t('client.result.theDesigner');

  return (
    <div>
      {previewEl}
      <div className="result-hero">
        <p className="eyebrow">{invite.projectName}</p>
        <h1 className="page-title" style={{ marginTop: 6 }}>{t('client.result.title')}</h1>
        <Figures effort={result.effort} price={result.price.total} confidence={result.confidence.level} />
        <p className="small muted" style={{ marginTop: 18 }}>{t('client.result.disclaimer')}</p>
      </div>

      <div className="grid-2" style={{ marginTop: 32, gap: 40 }}>
        <section>
          <h2 className="section-title" style={{ marginBottom: 12 }}>{t('client.result.basis')}</h2>
          <BasisList result={result} answers={answers} />
          {result.custom.pending.length > 0 && (
            <div className="warn-box" style={{ marginTop: 18 }}>
              <p style={{ fontWeight: 500 }}>{t('client.result.additional')}</p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.custom.pending.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
              <p className="xs" style={{ marginTop: 6 }}>{t('client.result.additionalNote')}</p>
            </div>
          )}
        </section>
        <section>
          <h2 className="section-title" style={{ marginBottom: 12 }}>{t('client.result.unknowns')}</h2>
          <UnknownList unknowns={result.unknowns} empty={t('client.result.noUnknowns')} />
          <p className="small muted" style={{ marginTop: 14 }}>
            {t('client.result.confidenceLine', { level: t(`level.${result.confidence.level}`), reasons: result.confidence.reasons.map((r) => tl(r)).join(t('common.sentenceSep')) })}
          </p>
        </section>
      </div>

      <hr className="hr" style={{ margin: '36px 0' }} />

      <div className="row" style={{ '--gap': '10px' }}>
        <button className="btn accent large" onClick={download} disabled={busy}>{busy ? t('doc.preparing') : t('client.result.download')}</button>
        <button className="btn large" onClick={() => openPreview(() => quoteDocument(quote, lang), () => update((s) => S.noteDownload(s)))}>{t('doc.previewPdf')}</button>
        <button className="btn large" onClick={() => printDocument(quoteDocument(quote, lang))}>{t('doc.print')}</button>
        <button className="btn ghost" onClick={onBack}>{t('client.result.edit')}</button>
      </div>

      <section className="panel" style={{ marginTop: 32 }}>
        {!session.submittedAt ? (
          <div className="stack" style={{ '--gap': '14px' }}>
            <h2 className="section-title">{t('client.result.submitTitle')}</h2>
            <p className="muted">{t('client.result.submitBody', { designer: designerName })}</p>
            <div>
              <button className="btn primary large" onClick={submit}>{t('client.result.submit')}</button>
            </div>
          </div>
        ) : (
          <ReturnCode code={code} invite={invite} designerName={designerName} session={session} designerProject={designerProject} />
        )}
      </section>
    </div>
  );
}

function ReturnCode({ code, invite, designerName, session, designerProject }) {
  const { t, dateTime } = useI18n();
  const filename = `${safeFilename(invite.projectName)} - ${t('client.code.fileSuffix')}.txt`;
  const fileText = `${t('client.code.fileIntro', { project: invite.projectName, designer: designerName })}\n\n${code}\n`;
  const mailHref = invite.designer?.email && code.length < 1800
    ? `mailto:${invite.designer.email}?subject=${encodeURIComponent(invite.projectName)}&body=${encodeURIComponent(fileText)}`
    : null;
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <h2 className="section-title">{t('client.code.title')}</h2>
      <p className="muted">{t('client.code.body', { designer: designerName })}</p>
      <div className="code-box" data-testid="return-code">{code || t('common.loading')}</div>
      <div className="row" style={{ '--gap': '8px' }}>
        <button className="btn primary" disabled={!code} onClick={async () => toast((await copyText(code)) ? t('client.code.copied') : t('client.code.copyFailed'))}>{t('client.code.copy')}</button>
        <button className="btn" disabled={!code} onClick={() => downloadText(fileText, filename)}>{t('client.code.download')}</button>
        {mailHref && <a className="btn" href={mailHref}>{t('client.code.email')}</a>}
      </div>
      <p className="xs muted">{t('client.code.updated', { time: dateTime(session.lastActiveAt) })}</p>
      <p className="xs muted">{t('client.code.changeLater')}</p>
      {designerProject && (
        <div className="note-box">
          <p>{t('preview.importHint')}</p>
          <button
            className="btn small primary"
            style={{ marginTop: 10 }}
            disabled={!code}
            onClick={async () => {
              const ok = await copyText(code);
              toast(ok ? t('client.code.copied') : t('client.code.copyFailed'));
              window.location.hash = `/projects/${designerProject.id}/overview`;
            }}
          >
            {t('preview.copyAndReturn')}
          </button>
        </div>
      )}
    </div>
  );
}
