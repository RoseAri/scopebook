import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { createAccess, createProject, latestEstimate, PROJECT_STATUSES, projectStatus } from '../store/actions.js';
import { effectiveEstimate, headlinePrice } from '../engine/versions.js';
import { navigate } from '../lib/router.jsx';
import { Empty, Field, Level, Modal, Progress, TextArea, TextInput } from '../components/ui.jsx';
import ImportDialog from './ImportDialog.jsx';
import { createSampleProject } from '../store/sample.js';
import { RestoreFromFolderButton } from './BackupControls.jsx';
import { getState, setState } from '../store/store.js';

export default function ProjectsPage() {
  const { t, lang } = useI18n();
  const projects = useStore((s) => s.projects);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    const list = Object.values(projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const by = {};
    for (const p of list) (by[projectStatus(p)] ||= []).push(p);
    return PROJECT_STATUSES.filter((s) => by[s]?.length).map((s) => ({ status: s, items: by[s] }));
  }, [projects]);

  const total = Object.keys(projects).length;

  // Preview builds open with a labelled sample so the workflow can be explored right away.
  useEffect(() => {
    if (typeof __SB_PREVIEW__ !== 'undefined' && __SB_PREVIEW__ && !Object.keys(getState().projects).length && !getState().sampleSeeded) {
      setState((st) => ({ ...st, sampleSeeded: true }));
      createSampleProject(lang);
    }
  }, [lang]);
  const visibleGroups = groups.filter((g) => showArchived || g.status !== 'archived');
  const archivedCount = groups.find((g) => g.status === 'archived')?.items.length || 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('projects.title')}</h1>
          <p className="lede">{t('projects.lede')}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>{t('projects.importResponse')}</button>
          <button className="btn primary" onClick={() => setCreating(true)}>{t('projects.new')}</button>
        </div>
      </div>

      {total === 0 ? (
        <Empty
          title={t('projects.emptyTitle')}
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <RestoreFromFolderButton />
              <button className="btn" onClick={() => navigate(`/projects/${createSampleProject(lang)}`)}>{t('projects.loadSample')}</button>
              <button className="btn primary" onClick={() => setCreating(true)}>{t('projects.new')}</button>
            </div>
          }
        >
          {t('projects.emptyBody')}
        </Empty>
      ) : (
        <>
          {visibleGroups.map((g) => (
            <section key={g.status} className="status-group">
              <h2>
                {t(`status.${g.status}`)}
                <span className="count">{g.items.length}</span>
              </h2>
              {g.items.map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </section>
          ))}
          {archivedCount > 0 && (
            <button className="btn-link small" style={{ marginTop: 28 }} onClick={() => setShowArchived((x) => !x)}>
              {showArchived ? t('projects.hideArchived') : t('projects.showArchived', { n: archivedCount })}
            </button>
          )}
        </>
      )}

      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function ProjectRow({ p }) {
  const { t, moneyRange, dateTime } = useI18n();
  const latest = latestEstimate(p);
  const eff = useMemo(() => (latest ? effectiveEstimate(latest) : null), [latest]);
  const completion = p.clientSession?.completion ?? 0;
  return (
    <a className="project-row" href={`#/projects/${p.id}`}>
      <div>
        <div className="p-name">{p.name}</div>
      </div>
      <div className="stack" style={{ '--gap': '6px' }}>
        <span className="small">{t(`status.${projectStatus(p)}`)}</span>
        {p.access && (
          <div className="row" style={{ '--gap': '8px', flexWrap: 'nowrap' }}>
            <div className="grow"><Progress value={completion} /></div>
            <span className="xs muted num">{Math.round(completion * 100)}%</span>
          </div>
        )}
      </div>
      <div>
        <div className="xs muted">{latest ? t('projects.estimateV', { n: latest.number }) : t('projects.latestEstimate')}</div>
        <div className="p-figure">{eff ? moneyRange(headlinePrice(eff), true) : '—'}</div>
      </div>
      <div>
        <div className="xs muted">{t('est.confidence')}</div>
        <div className="small">{eff ? <Level value={eff.confidence} kind="confidence" /> : '—'}</div>
      </div>
      <div>
        <div className="xs muted">{t('projects.updated')}</div>
        <div className="small num">{dateTime(p.updatedAt)}</div>
      </div>
    </a>
  );
}

function NewProjectModal({ onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', notes: '', link: true });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    const id = createProject({ name: form.name, notes: form.notes });
    if (form.link) createAccess(id);
    onClose();
    navigate(`/projects/${id}`);
  };
  return (
    <Modal
      title={t('projects.newTitle')}
      description={t('projects.newHint')}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={submit} disabled={!form.name.trim()}>{t('projects.create')}</button>
        </>
      }
    >
      <form className="stack" style={{ '--gap': '14px' }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t('projects.name')} htmlFor="np-name" help={t('projects.nameHelp')}>
          <TextInput id="np-name" value={form.name} onChange={set('name')} placeholder={t('projects.namePlaceholder')} />
        </Field>
        <Field label={t('projects.inquiry')} htmlFor="np-notes" help={t('projects.inquiryHelp')}>
          <TextArea id="np-notes" value={form.notes} onChange={set('notes')} rows={3} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.link} onChange={(e) => set('link')(e.target.checked)} />
          {t('projects.createLinkNow')}
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
