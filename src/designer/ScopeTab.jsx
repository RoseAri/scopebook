// Scope as currently understood, plus everything the designer learned in interviews.
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { addInfoItem, addInterviewNote, latestEstimate, NOTE_CATEGORIES, removeInfoItem } from '../store/actions.js';
import { inputsFromSession } from '../engine/versions.js';
import { LEVEL_LABEL } from '../engine/estimate.js';
import { Link } from '../lib/router.jsx';
import { Field, Select, SourceTag, TextArea } from '../components/ui.jsx';

export default function ScopeTab({ p }) {
  const { t, tl } = useI18n();
  const functions = useStore((s) => s.settings.baseline.functions);
  const latest = latestEstimate(p);
  const fnDefs = useMemo(
    () => Object.fromEntries([...functions, ...(latest?.snapshot.functions || []), ...(p.clientSession?.snapshotUsed?.functions || [])].map((f) => [f.id, f])),
    [functions, latest, p.clientSession],
  );
  const inputs = latest ? latest.inputs : p.clientSession ? inputsFromSession(p.clientSession) : null;

  return (
    <div className="two-col">
      <div className="stack" style={{ '--gap': '24px' }}>
        <InterviewNotes p={p} fnDefs={fnDefs} inputs={inputs} />
        <InfoItems p={p} />
      </div>
      <aside className="stack" style={{ '--gap': '24px' }}>
        <section className="panel">
          <div className="panel-head">
            <h2>{t('scope.current')}</h2>
            <span className="xs muted">{latest ? t('scope.fromVersion', { n: latest.number }) : t('scope.fromClient')}</span>
          </div>
          {!inputs?.functions.length && <p className="muted small">{t('scope.empty')}</p>}
          {inputs?.functions.length > 0 && (
            <table className="table">
              <tbody>
                {inputs.functions.map((f) => (
                  <tr key={f.fnId}>
                    <td>{fnDefs[f.fnId] ? tl(fnDefs[f.fnId].name) : f.fnId}</td>
                    <td className="r small muted">{tl(LEVEL_LABEL[f.level])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inputs?.custom?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="sub-title" style={{ marginBottom: 6 }}>{t('scope.additional')}</div>
              {inputs.custom.map((c) => (
                <div key={c.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span>{c.name}</span>
                  {c.included ? <span className="num">{c.hours}h</span> : <span className="tag assumption">{t('client.scope.needsReview')}</span>}
                </div>
              ))}
              <p className="xs muted" style={{ marginTop: 8 }}>{t('scope.additionalNote')}</p>
            </div>
          )}
          <Link to={`/projects/${p.id}/estimates`} className="btn small" style={{ marginTop: 16 }}>{t('scope.toEstimates')}</Link>
        </section>
      </aside>
    </div>
  );
}

function InterviewNotes({ p, fnDefs, inputs }) {
  const { t, tl, dateTime } = useI18n();
  const [form, setForm] = useState({ category: 'clarification', text: '', relatedFn: '' });
  const fnOptions = (inputs?.functions || []).map((f) => ({ value: f.fnId, label: fnDefs[f.fnId] ? tl(fnDefs[f.fnId].name) : f.fnId }));
  const add = () => {
    if (!form.text.trim()) return;
    addInterviewNote(p.id, { category: form.category, text: form.text.trim(), relatedFn: form.relatedFn || null });
    setForm({ ...form, text: '' });
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('notes.title')}</h2><SourceTag source="designer" /></div>
      <p className="small muted" style={{ marginBottom: 16 }}>{t('notes.hint')}</p>
      <div className="stack" style={{ '--gap': '10px' }}>
        <div className="grid-2">
          <Field label={t('notes.category')}>
            <Select value={form.category} onChange={(v) => setForm({ ...form, category: v || 'clarification' })} options={NOTE_CATEGORIES.map((c) => ({ value: c, label: t(`notes.cat.${c}`) }))} />
          </Field>
          <Field label={t('notes.related')}>
            <Select value={form.relatedFn} onChange={(v) => setForm({ ...form, relatedFn: v || '' })} placeholder={t('notes.relatedNone')} options={fnOptions} />
          </Field>
        </div>
        <TextArea value={form.text} onChange={(v) => setForm({ ...form, text: v })} rows={3} placeholder={t('notes.placeholder')} aria-label={t('notes.title')} />
        <div><button className="btn primary" onClick={add} disabled={!form.text.trim()}>{t('notes.add')}</button></div>
      </div>
      <div style={{ marginTop: 18 }}>
        {p.interviewNotes.map((n) => (
          <div key={n.id} className="record">
            <div className="record-meta" style={{ marginTop: 0, marginBottom: 6 }}>
              <span className="num">{dateTime(n.at)}</span>
              <span className="tag plain">{t(`notes.cat.${n.category}`)}</span>
              {n.relatedFn && <span>{fnDefs[n.relatedFn] ? tl(fnDefs[n.relatedFn].name) : n.relatedFn}</span>}
            </div>
            <p className="pre">{n.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoItems({ p }) {
  const { t, dateTime } = useI18n();
  const [form, setForm] = useState({ kind: 'info', text: '' });
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('info.title')}</h2></div>
      <p className="small muted" style={{ marginBottom: 14 }}>{t('info.hint')}</p>
      <div className="row" style={{ '--gap': '8px', flexWrap: 'nowrap' }}>
        <div style={{ width: 150, flex: 'none' }}>
          <Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v || 'info' })} options={[{ value: 'info', label: t('info.kind.info') }, { value: 'assumption', label: t('info.kind.assumption') }]} />
        </div>
        <input className="input grow" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={t('info.placeholder')} aria-label={t('info.title')} />
        <button className="btn" disabled={!form.text.trim()} onClick={() => { addInfoItem(p.id, { kind: form.kind, text: form.text.trim() }); setForm({ ...form, text: '' }); }}>{t('common.add')}</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {p.infoItems.map((i) => (
          <div key={i.id} className="record row between" style={{ '--gap': '10px', flexWrap: 'nowrap' }}>
            <div className="grow">
              <div>{i.text}</div>
              <div className="record-meta"><SourceTag source={i.kind === 'assumption' ? 'assumption' : 'designer'} /><span>{dateTime(i.at)}</span></div>
            </div>
            <button className="btn small ghost" onClick={() => removeInfoItem(p.id, i.id)}>{t('common.delete')}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
