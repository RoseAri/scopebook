import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { flushNow, useStore } from '../store/store.js';
import { Link, navigate } from '../lib/router.jsx';
import {
  clientUpdatedSinceV1, createAccess, importClientSession, currentSnapshot, deleteProject, extendAccess, inviteLink, latestEstimate,
  markLinkCopied, PROJECT_STATUSES, projectStatus, setAccessActive, setStatusOverride, updateProject,
} from '../store/actions.js';
import { estimate } from '../engine/estimate.js';
import { effectiveEstimate, headlinePrice, inputsFromSession, inputsWithDesignerEntries } from '../engine/versions.js';
import { copyText } from '../lib/util.js';
import { storage } from '../store/storage.js';
import { Confirm, Empty, Field, Level, Modal, Progress, Select, TextArea, TextInput, toast } from '../components/ui.jsx';
import { UnknownList } from '../components/estimate.jsx';
import ImportDialog from './ImportDialog.jsx';
import ResponsesTab from './ResponsesTab.jsx';
import ScopeTab from './ScopeTab.jsx';
import EstimatesTab from './EstimatesTab.jsx';
import { ActivityTab, DocumentsTab, mergedActivity } from './RecordTabs.jsx';
import ContractTab from './ContractTab.jsx';
import { recordDocument } from '../documents/templates.js';
import { downloadPdf } from '../documents/export.js';

const TABS = ['overview', 'responses', 'scope', 'estimates', 'activity', 'documents', 'contract'];

export default function ProjectPage({ id, tab }) {
  const { t } = useI18n();
  const p = useStore((s) => s.projects[id]);
  const [editing, setEditing] = useState(false);
  if (!p) {
    return <Empty title={t('project.notFound')} action={<Link to="/" className="btn">{t('nav.projects')}</Link>} />;
  }
  const status = projectStatus(p);
  const counts = {
    responses: Object.keys(p.clientSession?.responses || {}).length,
    scope: p.interviewNotes.length + p.infoItems.length,
    estimates: p.estimates.length,
    documents: p.estimates.filter((v) => v.locked).length + p.quotes.length + p.contracts.length,
    contract: p.contracts.length,
  };
  return (
    <div>
      <div className="page-head" style={{ marginBottom: 8 }}>
        <div>
          <Link to="/" className="small" style={{ color: 'var(--muted)', textDecoration: 'none' }}>{t('nav.projects')}</Link>
          <h1 className="page-title" style={{ marginTop: 4 }}>{p.name}</h1>
        </div>
        <div className="row">
          <span className="small muted">{t(`status.${status}`)}{p.statusOverride ? ` · ${t('project.manualStatus')}` : ''}</span>
          <button className="btn" onClick={() => setEditing(true)}>{t('project.edit')}</button>
        </div>
      </div>
      <nav className="tabs" aria-label={t('project.sections')}>
        {TABS.map((k) => (
          <Link key={k} to={`/projects/${id}/${k}`} current={tab === k}>
            {t(`tab.${k}`)}
            {counts[k] ? <span className="count">{counts[k]}</span> : null}
          </Link>
        ))}
      </nav>
      {tab === 'overview' && <Overview p={p} />}
      {tab === 'responses' && <ResponsesTab p={p} />}
      {tab === 'scope' && <ScopeTab p={p} />}
      {tab === 'estimates' && <EstimatesTab p={p} />}
      {tab === 'activity' && <ActivityTab p={p} />}
      {tab === 'documents' && <DocumentsTab p={p} />}
      {tab === 'contract' && <ContractTab p={p} />}
      {editing && <EditProject p={p} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditProject({ p, onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    projectName: p.name,
    notes: p.notes,
    status: p.statusOverride || '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => {
    updateProject(p.id, (d) => {
      d.name = form.projectName.trim() || d.name;
      d.notes = form.notes;
    });
    if ((form.status || null) !== (p.statusOverride || null)) setStatusOverride(p.id, form.status || null);
    onClose();
  };
  return (
    <Modal
      title={t('project.editTitle')}
      onClose={onClose}
      actions={
        <>
          {p.statusOverride === 'archived' && (
            <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>{t('project.delete')}</button>
          )}
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={save}>{t('common.save')}</button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '14px' }}>
        <Field label={t('projects.name')}><TextInput value={form.projectName} onChange={set('projectName')} /></Field>
        <Field label={t('projects.inquiry')}><TextArea value={form.notes} onChange={set('notes')} rows={3} /></Field>
        <Field label={t('project.statusOverride')} help={t('project.statusOverrideHelp')}>
          <Select value={form.status} onChange={(v) => set('status')(v || '')} placeholder={t('project.statusAuto')} options={PROJECT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
        </Field>
      </div>
      {confirmDelete && (
        <Confirm
          title={t('project.deleteTitle')}
          message={t('project.deleteBody')}
          confirmLabel={t('project.delete')}
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => { deleteProject(p.id); onClose(); navigate('/'); }}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function useLiveEstimate(p) {
  const settings = useStore((s) => s.settings);
  return useMemo(() => {
    const latest = latestEstimate(p);
    if (latest) return { eff: effectiveEstimate(latest), version: latest };
    if (!p.clientSession) return null;
    const inputs = inputsWithDesignerEntries(inputsFromSession(p.clientSession), p.designerEntries);
    if (!inputs.functions.length) return null;
    const system = estimate(inputs, p.clientSession.snapshotUsed || currentSnapshot(settings));
    return { live: true, eff: { system, effort: system.effort, price: system.price, fixedPrice: null, confidence: system.confidence.level, risk: system.risk.level, schedule: system.schedule.pressure, unknowns: system.unknowns } };
  }, [p, settings]);
}

function Overview({ p }) {
  const { t, moneyRange } = useI18n();
  const live = useLiveEstimate(p);
  const [importing, setImporting] = useState(false);
  const eff = live?.eff;
  const highUnknowns = (eff?.unknowns || []).filter((u) => u.impact === 'high');
  const local = p.access ? storage.loadClientSession(p.access.token) : null;
  const pendingLocal = local && local.submittedAt && (!p.clientSession || p.clientSession.lastActiveAt < local.lastActiveAt) ? local : null;
  const updatedSince = clientUpdatedSinceV1(p);

  return (
    <div className="stack" style={{ '--gap': '28px' }}>
      {pendingLocal && (
        <div className="note-box row between">
          <span>{t('overview.localReply', { pct: Math.round((pendingLocal.completion || 0) * 100) })}</span>
          <div className="row" style={{ '--gap': '8px' }}>
            <button className="btn small" onClick={() => setImporting(true)}>{t('overview.pasteCode')}</button>
            <button className="btn small primary" onClick={() => { const r = importClientSession(pendingLocal); toast(r.ok ? (r.createdVersion ? t('import.createdV1') : t('import.done')) : t(`import.error.${r.error}`)); }}>{t('overview.importLocal')}</button>
          </div>
        </div>
      )}
      {updatedSince && (
        <div className="warn-box row between">
          <span>{t('overview.clientUpdated')}</span>
          <Link to={`/projects/${p.id}/estimates`} className="btn small">{t('overview.reviewEstimates')}</Link>
        </div>
      )}
      <div className="facts facts-3">
        <div>
          <div className="f-label">{live?.live ? t('overview.liveEstimate') : live ? t('overview.currentEstimate', { n: live.version.number }) : t('overview.currentEstimateNone')}</div>
          <div className="f-value num">{eff ? moneyRange(headlinePrice(eff), true) : '—'}</div>
          {eff && <div className="xs muted">{eff.effort.min}–{eff.effort.max}h</div>}
        </div>
        <div>
          <div className="f-label">{t('est.confidence')}</div>
          <div className="f-value">{eff ? <Level value={eff.confidence} kind="confidence" /> : '—'}</div>
        </div>
        <div>
          <div className="f-label">{t('est.risk')}</div>
          <div className="f-value">{eff ? <Level value={eff.risk} /> : '—'}</div>
        </div>
        <div>
          <div className="f-label">{t('est.schedule')}</div>
          <div className="f-value">{eff?.schedule ? <Level value={eff.schedule} /> : '—'}</div>
        </div>
        <div>
          <div className="f-label">{t('overview.completion')}</div>
          <div className="f-value num">{p.clientSession ? `${Math.round(p.clientSession.completion * 100)}%` : '—'}</div>
          {p.clientSession && <Progress value={p.clientSession.completion} />}
        </div>
        <div>
          <div className="f-label">{t('overview.status')}</div>
          <div className="f-value" style={{ fontSize: 'var(--fs-lg)' }}>{t(`status.${projectStatus(p)}`)}</div>
        </div>
      </div>

      <div className="two-col">
        <div className="stack" style={{ '--gap': '24px' }}>
          <section className="panel">
            <div className="panel-head"><h2>{t('overview.unknowns')}</h2></div>
            {eff ? <UnknownList unknowns={highUnknowns} empty={t('overview.noUnknowns')} /> : <p className="muted small">{t('overview.waitingForClient')}</p>}
          </section>
          <DecisionChain p={p} />
        </div>
        <div className="stack" style={{ '--gap': '24px' }}>
          <AccessPanel p={p} onImport={() => setImporting(true)} />
          {p.notes && (
            <section className="panel">
              <div className="panel-head"><h2>{t('projects.inquiry')}</h2><span className="tag designer">{t('source.designer')}</span></div>
              <p className="pre small">{p.notes}</p>
            </section>
          )}
        </div>
      </div>
      {importing && <ImportDialog projectId={p.id} onClose={() => setImporting(false)} />}
    </div>
  );
}

function AccessPanel({ p, onImport }) {
  const { t, dateTime, date } = useI18n();
  const settings = useStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const a = p.access;
  if (!a) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>{t('access.title')}</h2></div>
        <p className="small muted" style={{ marginBottom: 14 }}>{t('access.none')}</p>
        <button className="btn primary" onClick={() => createAccess(p.id)}>{t('access.create')}</button>
      </section>
    );
  }
  const expired = a.expiresAt && new Date(a.expiresAt) < new Date();
  const copy = async () => {
    setBusy(true);
    const url = await inviteLink(p, settings);
    const ok = await copyText(url);
    markLinkCopied(p.id);
    setBusy(false);
    toast(ok ? t('access.copied') : t('access.copyFailed'));
  };
  const open = async () => {
    const url = `${await inviteLink(p, settings, { local: true })}&preview=1`;
    flushNow();
    const inFrame = window.self !== window.top;
    const w = inFrame ? null : window.open(url, '_blank');
    if (w) w.opener = null;
    else window.location.hash = url.slice(url.indexOf('#') + 1); // embedded or pop-ups blocked: open here
  };
  const s = p.clientSession;
  const onThisComputerOnly = !settings.appUrl && /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);
  return (
    <section className="panel">
      {onThisComputerOnly && (
        <div className="warn-box" style={{ marginBottom: 16 }}>
          {t('access.noAppUrl')} <Link to="/settings">{t('access.setAppUrl')}</Link>
        </div>
      )}
      <div className="panel-head">
        <h2>{t('access.title')}</h2>
        <span className="dotline small">
          <span className={`dot ${a.active && !expired ? 'low' : 'high'}`} />
          {!a.active ? t('access.revoked') : expired ? t('access.expired') : t('access.active')}
        </span>
      </div>
      <table className="table">
        <tbody>
          <tr><td className="muted">{t('access.token')}</td><td className="r num">…{a.token.slice(-4)}</td></tr>
          <tr><td className="muted">{t('access.created')}</td><td className="r">{date(a.createdAt)}</td></tr>
          <tr><td className="muted">{t('access.expires')}</td><td className="r">{a.expiresAt ? date(a.expiresAt) : t('access.noExpiry')}</td></tr>
          <tr><td className="muted">{t('access.opened')}</td><td className="r">{a.firstOpenedAt ? dateTime(a.firstOpenedAt) : t('access.notYet')}</td></tr>
          <tr><td className="muted">{t('access.lastActive')}</td><td className="r">{a.lastAccessedAt ? dateTime(a.lastAccessedAt) : '—'}</td></tr>
          <tr><td className="muted">{t('access.progress')}</td><td className="r">{s ? `${Math.round(s.completion * 100)}%` : '—'}</td></tr>
          <tr><td className="muted">{t('access.completion')}</td><td className="r">{s?.submittedAt ? t('access.submittedAt', { time: dateTime(s.submittedAt) }) : s ? t('access.inProgress') : t('access.notYet')}</td></tr>
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 16, '--gap': '8px' }}>
        <button className="btn primary" onClick={copy} disabled={busy || !a.active}>{t('access.copy')}</button>
        <button className="btn" onClick={open} disabled={!a.active}>{t('access.preview')}</button>
        <button className="btn" onClick={onImport}>{t('access.import')}</button>
      </div>
      <div className="row" style={{ marginTop: 10, '--gap': '14px' }}>
        {!a.active && <button className="btn-link small" onClick={() => setAccessActive(p.id, true)}>{t('access.reactivate')}</button>}
        <button className="btn-link small" onClick={() => extendAccess(p.id, settings.inviteExpiryDays || 30)}>{t('access.extend', { n: settings.inviteExpiryDays || 30 })}</button>
      </div>
      <p className="xs muted" style={{ marginTop: 14 }}>{t('access.howItWorks')}</p>
    </section>
  );
}

function DecisionChain({ p }) {
  const { t, date, lang } = useI18n();
  const settings = useStore((s) => s.settings);
  const v1 = p.estimates.find((v) => v.kind === 'preliminary');
  const revisedDrafts = p.estimates.filter((v) => v.kind !== 'preliminary');
  const revisedLocked = revisedDrafts.filter((v) => v.locked);
  const prelimQuote = p.quotes.find((q) => q.kind === 'preliminary');
  const finalQuote = [...p.quotes].reverse().find((q) => q.kind === 'final');
  const contracts = p.contracts;
  const finalContract = contracts.find((c) => c.status === 'final');
  const steps = [
    { key: 'inquiry', done: true, meta: date(p.createdAt) },
    { key: 'responses', done: !!p.clientSession, meta: p.clientSession ? `${Math.round(p.clientSession.completion * 100)}%` : null },
    { key: 'interpretation', done: !!p.clientSession?.scope?.generatedFor },
    { key: 'preliminary', done: !!v1, meta: v1 ? `v${v1.number}` : null },
    { key: 'prelimQuote', done: !!prelimQuote, meta: prelimQuote ? `Q${prelimQuote.number}` : null },
    { key: 'interview', done: p.interviewNotes.length > 0, meta: p.interviewNotes.length ? t('chain.notes', { n: p.interviewNotes.length }) : null },
    { key: 'revision', done: revisedDrafts.length > 0, meta: revisedDrafts.length ? revisedDrafts.map((v) => `v${v.number}`).join(', ') : null },
    { key: 'revised', done: revisedLocked.length > 0, meta: revisedLocked.length ? `v${revisedLocked[revisedLocked.length - 1].number}` : null },
    { key: 'finalQuote', done: !!finalQuote, meta: finalQuote ? `Q${finalQuote.number}` : null },
    { key: 'contractDraft', done: contracts.length > 0, meta: contracts.length ? `C${contracts[0].number}` : null },
    { key: 'contractEdits', done: contracts.length > 1 || contracts.some((c) => c.editedAt), meta: contracts.length > 1 ? t('chain.revisions', { n: contracts.length - 1 }) : null },
    { key: 'finalContract', done: !!finalContract, meta: finalContract ? `C${finalContract.number}` : null },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  const exportRecord = async () => {
    const entries = mergedActivity(p).reverse().map((e) => ({ time: new Date(e.at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', { hour12: false }), who: t(`actor.${e.actor}`), text: e.text[lang] || e.text.zh }));
    await downloadPdf(recordDocument({ project: p, lang, settings, entries }));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t('chain.title')}</h2>
        <button className="btn small" onClick={exportRecord}>{t('chain.export')}</button>
      </div>
      <ol className="chain">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : i === currentIndex ? 'current' : ''}>
            <div className="c-title">{t(`chain.${s.key}`)}</div>
            {s.meta && <div className="c-meta">{s.meta}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
