// Estimate versions: system estimate vs designer estimate, overrides with
// reasons, diffs between versions, and quotes generated from locked versions.
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { QUESTIONS, FLOW_STEP_TYPES } from '../data/questionnaire.js';
import { FLOW_GOALS } from '../data/baseline.js';
import { flowGoalsInScope, LEVEL_LABEL } from '../engine/estimate.js';
import { diffVersions, effectiveEstimate, headlinePrice, textOf } from '../engine/versions.js';
import {
  createQuote, createVersionFromLatest, createVersionFromResponses, deleteDraftVersion, lockVersion,
  quoteKindLabel, refreshVersionSnapshot, updateVersion, versionKindLabel,
} from '../store/actions.js';
import { Confirm, Empty, Field, Modal, NumberInput, Select, SourceTag, TextArea, TextInput, toast } from '../components/ui.jsx';
import { EstimateLedger, Figures, PriceLedger, SignalList, UnknownList, ScheduleLine } from '../components/estimate.jsx';
import { estimateDocument, quoteDocument } from '../documents/templates.js';
import { downloadPdf } from '../documents/export.js';
import { usePdfPreview } from '../components/PdfPreview.jsx';
import { uid } from '../lib/util.js';
import { navigate } from '../lib/router.jsx';

const T = (zh, en) => ({ zh, en });

export default function EstimatesTab({ p }) {
  const { t, tl, moneyRange, date } = useI18n();
  const [selectedId, setSelectedId] = useState(null);
  const [asking, setAsking] = useState(false);
  const versions = p.estimates;
  const selected = versions.find((v) => v.id === selectedId) || versions[versions.length - 1];
  const canFromResponses = !!p.clientSession || Object.keys(p.designerEntries).length > 0;

  if (!versions.length) {
    return (
      <Empty
        title={t('estimates.emptyTitle')}
        action={canFromResponses ? <button className="btn primary" onClick={() => setSelectedId(createVersionFromResponses(p.id))}>{t('estimates.fromResponses')}</button> : null}
      >
        {canFromResponses ? t('estimates.emptyBodyReady') : t('estimates.emptyBody')}
      </Empty>
    );
  }

  return (
    <div className="stack" style={{ '--gap': '28px' }}>
      <section>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 className="section-title">{t('estimates.versions')}</h2>
          <div className="row" style={{ '--gap': '8px' }}>
            {canFromResponses && (
              <button className="btn" onClick={() => setSelectedId(createVersionFromResponses(p.id))}>{t('estimates.fromResponses')}</button>
            )}
            <button className="btn primary" onClick={() => setAsking(true)}>{t('estimates.newVersion')}</button>
          </div>
        </div>
        <div className="table-wrap panel flush">
          <table className="table">
            <thead>
              <tr>
                <th>{t('estimates.version')}</th>
                <th>{t('estimates.kind')}</th>
                <th>{t('estimates.source')}</th>
                <th>{t('estimates.created')}</th>
                <th className="r">{t('est.effort')}</th>
                <th className="r">{t('estimates.price')}</th>
                <th>{t('estimates.state')}</th>
              </tr>
            </thead>
            <tbody>
              {[...versions].reverse().map((v) => {
                const eff = effectiveEstimate(v);
                const on = v.id === selected.id;
                return (
                  <tr key={v.id} onClick={() => setSelectedId(v.id)} style={{ cursor: 'pointer', background: on ? 'var(--accent-wash)' : undefined }}>
                    <td><button className="btn-link" onClick={() => setSelectedId(v.id)} style={{ fontFamily: 'var(--serif)', fontSize: 'var(--fs-lg)', textDecoration: on ? 'none' : undefined }}>v{v.number}</button></td>
                    <td>{tl(versionKindLabel(v.kind))}</td>
                    <td><SourceTag source={v.source === 'client' ? 'system' : v.source === 'mixed' ? 'designer' : 'designer'} /></td>
                    <td className="num">{date(v.createdAt)}</td>
                    <td className="r num">{eff.effort.min}–{eff.effort.max}h</td>
                    <td className="r num">{moneyRange(headlinePrice(eff), true)}</td>
                    <td>{v.locked ? t('estimates.locked') : <span style={{ color: 'var(--accent-ink)' }}>{t('estimates.draft')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <VersionDetail key={selected.id} p={p} v={selected} onSelect={setSelectedId} />

      {asking && (
        <NewVersionModal
          latest={versions[versions.length - 1]}
          onClose={() => setAsking(false)}
          onCreate={(reason) => {
            setSelectedId(createVersionFromLatest(p.id, reason));
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

function NewVersionModal({ latest, onClose, onCreate }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={t('estimates.newVersion')}
      description={t('estimates.newVersionHint', { n: latest.number })}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={() => onCreate(reason)}>{t('estimates.create')}</button>
        </>
      }
    >
      <Field label={t('estimates.reason')} help={t('estimates.reasonHelp')}>
        <TextArea value={reason} onChange={setReason} rows={3} placeholder={t('estimates.reasonPlaceholder')} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function VersionDetail({ p, v, onSelect }) {
  const { t, tl, lang, date } = useI18n();
  const settings = useStore((s) => s.settings);
  const eff = useMemo(() => effectiveEstimate(v), [v]);
  const prev = p.estimates.find((x) => x.number === v.number - 1);
  const fnNames = useMemo(() => Object.fromEntries([...(prev?.snapshot.functions || []), ...v.snapshot.functions].map((f) => [f.id, f.name])), [v, prev]);
  const changes = useMemo(() => (prev ? diffVersions(prev, v, fnNames) : []), [prev, v, fnNames]);
  const [openPreview, previewEl] = usePdfPreview();
  const [quoting, setQuoting] = useState(false);
  const [locking, setLocking] = useState(null);
  const [discard, setDiscard] = useState(false);
  const quotes = p.quotes.filter((q) => q.estimateId === v.id);
  const draft = !v.locked;
  const upd = (fn) => updateVersion(p.id, v.id, fn);

  return (
    <section className="stack" style={{ '--gap': '24px' }}>
      <div className="row between top">
        <div>
          <p className="eyebrow">{tl(versionKindLabel(v.kind))} · {draft ? t('estimates.draftEditable') : t('estimates.lockedAt', { date: date(v.lockedAt) })}</p>
          <h2 className="page-title" style={{ fontSize: 'var(--fs-2xl)', marginTop: 4 }}>{t('estimates.versionTitle', { n: v.number })}</h2>
          {v.basedOn && <p className="small muted">{t('estimates.basedOn', { n: p.estimates.find((x) => x.id === v.basedOn)?.number })}</p>}
        </div>
        <div className="row" style={{ '--gap': '8px' }}>
          {draft ? (
            <>
              <button className="btn ghost" onClick={() => setDiscard(true)}>{t('estimates.discard')}</button>
              <button className="btn" onClick={() => setLocking('revised')}>{t('estimates.lockRevised')}</button>
              <button className="btn primary" onClick={() => setLocking('final')}>{t('estimates.lockFinal')}</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => openPreview(() => estimateDocument({ project: p, version: v, eff, settings, lang }))}>{t('doc.previewPdf')}</button>
              <button className="btn" onClick={() => downloadPdf(estimateDocument({ project: p, version: v, eff, settings, lang }))}>{t('estimates.downloadSummary')}</button>
              <button className="btn primary" onClick={() => setQuoting(true)}>{v.kind === 'final' ? t('estimates.generateFinalQuote') : t('estimates.generateQuote')}</button>
            </>
          )}
        </div>
      </div>

      {!draft && v.kind !== 'final' && v === p.estimates[p.estimates.length - 1] && (
        <div className="note-box row between">
          <span>{t('estimates.toFinalHint')}</span>
          <button className="btn small primary" onClick={() => onSelect(createVersionFromLatest(p.id, t('estimates.toFinalReason')))}>{t('estimates.createFinalDraft')}</button>
        </div>
      )}
      {draft && (
        <div className="note-box">
          {t('estimates.draftNote')}{' '}
          <button className="btn-link" onClick={() => refreshVersionSnapshot(p.id, v.id)}>{t('estimates.refreshSnapshot')}</button>
        </div>
      )}

      <div className="panel">
        <Figures effort={eff.effort} price={eff.price.total} confidence={eff.confidence} fixedPrice={eff.fixedPrice} compact />
        <div className="grid-3" style={{ marginTop: 20 }}>
          <div><div className="figure-label">{t('est.risk')}</div><SignalList signals={eff.risk !== eff.system.risk.level ? [{ id: 'ov', level: eff.risk, text: T('設計師調整', 'Set by the designer') }] : eff.system.risk.signals} /></div>
          <div><div className="figure-label">{t('est.schedule')}</div><ScheduleLine schedule={{ ...eff.system.schedule, pressure: eff.schedule }} /></div>
          <div><div className="figure-label">{t('estimates.screensStates')}</div><span className="num">{t('estimates.screensStatesValue', { s: eff.screens, st: eff.states })}</span></div>
        </div>
      </div>

      <div className="two-col">
        <div className="stack" style={{ '--gap': '24px' }}>
          {draft ? (
            <>
              <ReasonEditor v={v} upd={upd} />
              <ScopeEditor v={v} upd={upd} />
              <AnswersEditor v={v} upd={upd} />
              <FlowsEditor v={v} upd={upd} />
              <OverridesEditor v={v} eff={eff} upd={upd} />
              <ListsEditor v={v} eff={eff} upd={upd} />
            </>
          ) : (
            <LockedSummary v={v} eff={eff} />
          )}
        </div>
        <aside className="stack" style={{ '--gap': '24px' }}>
          {prev && (
            <section className="panel">
              <div className="panel-head"><h2>{t('estimates.whatChanged', { a: prev.number, b: v.number })}</h2></div>
              {changes.length ? <DiffList changes={changes} /> : <p className="small muted">{t('estimates.noChanges')}</p>}
              {v.reason && (
                <div style={{ marginTop: 14 }}>
                  <div className="figure-label">{t('estimates.designerReason')}</div>
                  <p className="small pre">{v.reason}</p>
                </div>
              )}
            </section>
          )}
          <section className="panel">
            <div className="panel-head"><h2>{t('estimates.systemEstimate')}</h2><SourceTag source="system" /></div>
            <EstimateLedger result={eff.system} />
          </section>
          <section className="panel">
            <div className="panel-head"><h2>{t('estimates.pricing')}</h2></div>
            <PriceLedger price={eff.price} effort={eff.effort} />
            {eff.fixedPrice != null && <p className="small" style={{ marginTop: 12 }}>{t('estimates.fixedPriceSet')}</p>}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>{t('estimates.quotes')}</h2></div>
            {quotes.length ? (
              quotes.map((q) => (
                <div key={q.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span>Q{q.number} · {tl(quoteKindLabel(q.kind))}</span>
                  <button className="btn-link xs" onClick={() => navigate(`/projects/${p.id}/documents`)}>{t('estimates.openDocuments')}</button>
                </div>
              ))
            ) : (
              <p className="small muted">{v.locked ? t('estimates.noQuotes') : t('estimates.lockFirst')}</p>
            )}
          </section>
        </aside>
      </div>

      {previewEl}
      {locking && <LockModal v={v} eff={eff} kind={locking} p={p} onClose={() => setLocking(null)} />}
      {quoting && <QuoteModal p={p} v={v} eff={eff} onClose={() => setQuoting(false)} />}
      {discard && <Confirm title={t('estimates.discardTitle')} message={t('estimates.discardBody')} confirmLabel={t('estimates.discard')} danger onClose={() => setDiscard(false)} onConfirm={() => deleteDraftVersion(p.id, v.id)} />}
    </section>
  );
}

export function DiffList({ changes }) {
  const { t, tl, moneyRange } = useI18n();
  const val = (x) => (x && x.money ? moneyRange(x.money, true) : tl(x));
  return (
    <ul className="diff">
      {changes.map((c, i) => (
        <li key={i}>
          <span className={`d-kind ${c.kind}`}>{t(`diff.${c.kind}`)}</span>
          <span>
            {c.value ? (
              <>{tl(c.label)}{t('common.colon')}{tl(c.value)}</>
            ) : (
              <>
                {tl(c.label)}{t('common.colon')}
                <span className="muted">{val(c.from)}</span>
                <span className="arrow">→</span>
                <span>{val(c.to)}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReasonEditor({ v, upd }) {
  const { t } = useI18n();
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('estimates.reasonTitle')}</h2><SourceTag source="designer" /></div>
      <div className="stack" style={{ '--gap': '12px' }}>
        <Field label={t('estimates.reason')} help={t('estimates.reasonHelp')}>
          <TextArea value={v.reason} onChange={(val) => upd((d) => { d.reason = val; })} rows={2} />
        </Field>
        <Field label={t('estimates.notes')}>
          <TextArea value={v.notes} onChange={(val) => upd((d) => { d.notes = val; })} rows={2} />
        </Field>
      </div>
    </section>
  );
}

function ScopeEditor({ v, upd }) {
  const { t, tl } = useI18n();
  const [adding, setAdding] = useState('');
  const [custom, setCustom] = useState('');
  const fnDefs = Object.fromEntries(v.snapshot.functions.map((f) => [f.id, f]));
  const inScope = new Set(v.inputs.functions.map((f) => f.fnId));
  const available = v.snapshot.functions.filter((f) => !inScope.has(f.id));
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('estimates.scope')}</h2></div>
      <table className="table">
        <tbody>
          {v.inputs.functions.map((f, i) => (
            <tr key={f.fnId}>
              <td>{fnDefs[f.fnId] ? tl(fnDefs[f.fnId].name) : f.fnId}</td>
              <td style={{ width: 170 }}>
                <Select
                  value={f.level}
                  onChange={(lv) => upd((d) => { d.inputs.functions[i] = { ...d.inputs.functions[i], level: lv || 'basic', levelChosen: true }; })}
                  options={['basic', 'advanced', 'unsure'].map((l) => ({ value: l, label: tl(LEVEL_LABEL[l]) }))}
                />
              </td>
              <td className="r" style={{ width: 70 }}>
                <button className="btn small ghost" onClick={() => upd((d) => { d.inputs.functions.splice(i, 1); })}>{t('common.remove')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12, '--gap': '8px', flexWrap: 'nowrap' }}>
        <div className="grow">
          <Select value={adding} onChange={(val) => setAdding(val || '')} placeholder={t('estimates.addFunction')} options={available.map((f) => ({ value: f.id, label: tl(f.name) }))} />
        </div>
        <button className="btn" disabled={!adding} onClick={() => { upd((d) => { d.inputs.functions.push({ fnId: adding, level: 'basic', levelChosen: true, origin: 'designer' }); }); setAdding(''); }}>{t('common.add')}</button>
      </div>

      <div className="sub-title" style={{ margin: '22px 0 4px' }}>{t('estimates.custom')}</div>
      <p className="xs muted" style={{ marginBottom: 8 }}>{t('estimates.customHint')}</p>
      {(v.inputs.custom || []).map((c, i) => (
        <div key={c.id} className="row" style={{ '--gap': '8px', padding: '8px 0', borderBottom: '1px solid var(--rule)', flexWrap: 'nowrap' }}>
          <div className="grow">
            <div>{c.name}</div>
            <div className="xs"><SourceTag source={c.origin === 'client' ? 'client' : 'designer'} /></div>
          </div>
          <div style={{ width: 90 }}>
            <NumberInput className="tight" value={c.hours} onChange={(h) => upd((d) => { d.inputs.custom[i].hours = h; d.inputs.custom[i].included = h != null; })} placeholder="h" aria-label={t('estimates.customHours')} />
          </div>
          <label className="check xs" style={{ width: 92 }}>
            <input type="checkbox" checked={!!c.included} disabled={c.hours == null} onChange={(e) => upd((d) => { d.inputs.custom[i].included = e.target.checked; })} />
            {t('estimates.include')}
          </label>
          <button className="btn small ghost" onClick={() => upd((d) => { d.inputs.custom.splice(i, 1); })}>×</button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10, '--gap': '8px', flexWrap: 'nowrap' }}>
        <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('estimates.customName')} aria-label={t('estimates.customName')} />
        <button className="btn" disabled={!custom.trim()} onClick={() => { upd((d) => { (d.inputs.custom ||= []).push({ id: uid('c'), name: custom.trim(), note: '', origin: 'designer', hours: null, included: false }); }); setCustom(''); }}>{t('common.add')}</button>
      </div>
    </section>
  );
}

const EDITABLE_QUESTIONS = ['currentState', 'approach', 'roles', 'roleDiff', 'statuses', 'dataVolume', 'specialCases', 'integrations', 'devices', 'decider', 'approvalLayers', 'collabRoles', 'contentReadiness', 'techConstraints', 'deadline', 'deadlineDate', 'engineering'];

function AnswersEditor({ v, upd }) {
  const { t, tl } = useI18n();
  const a = v.inputs.answers || {};
  const set = (qid, value) => upd((d) => { d.inputs.answers = { ...(d.inputs.answers || {}), [qid]: value }; });
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('estimates.answers')}</h2></div>
      <p className="xs muted" style={{ marginBottom: 10 }}>{t('estimates.answersHint')}</p>
      <table className="table">
        <tbody>
          {EDITABLE_QUESTIONS.map((qid) => {
            const q = QUESTIONS[qid];
            return (
              <tr key={qid}>
                <td className="small" style={{ width: '45%' }}>{tl(q.title)}</td>
                <td>
                  {q.type === 'single' && (
                    <Select value={a[qid] ?? ''} onChange={(val) => set(qid, val)} placeholder={t('estimates.noAnswer')} options={q.options.map((o) => ({ value: o.id, label: tl(o.label) }))} />
                  )}
                  {q.type === 'date' && <input type="date" className="input" value={a[qid] || ''} onChange={(e) => set(qid, e.target.value || null)} />}
                  {q.type === 'multi' && (
                    <div className="row" style={{ '--gap': '4px 12px' }}>
                      {q.options.map((o) => {
                        const on = (a[qid] || []).includes(o.id);
                        return (
                          <label key={o.id} className="check xs">
                            <input type="checkbox" checked={on} onChange={() => set(qid, on ? a[qid].filter((x) => x !== o.id) : [...(a[qid] || []).filter((x) => !q.exclusive?.includes(x)), o.id])} />
                            {tl(o.label)}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function FlowsEditor({ v, upd }) {
  const { t, tl } = useI18n();
  const fnDefs = Object.fromEntries(v.snapshot.functions.map((f) => [f.id, f]));
  const goals = flowGoalsInScope(v.inputs.functions, fnDefs, v.inputs.goals || []);
  if (!goals.length) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('estimates.flows')}</h2></div>
      {goals.map((g) => {
        const f = v.inputs.flows?.[g] || { mode: 'standard', steps: [] };
        const setFlow = (fn) => upd((d) => {
          d.inputs.flows ||= {};
          const cur = d.inputs.flows[g] || { mode: 'standard', steps: [] };
          d.inputs.flows[g] = fn(JSON.parse(JSON.stringify(cur)));
        });
        return (
          <div key={g} className="record">
            <div className="row between">
              <span className="sub-title">{tl(FLOW_GOALS[g].name)}</span>
              <div style={{ width: 180 }}>
                <Select
                  value={f.mode || 'standard'}
                  onChange={(m) => setFlow((cur) => ({ ...cur, mode: m || 'standard', steps: m === 'custom' && !cur.steps?.length ? FLOW_GOALS[g].steps.map((st) => ({ id: uid('st'), type: st.type, preset: st.label, text: '', branches: [], unsure: false })) : cur.steps || [] }))}
                  options={['standard', 'custom', 'unsure'].map((m) => ({ value: m, label: t(`responses.flowMode.${m}`) }))}
                />
              </div>
            </div>
            {f.mode === 'custom' && (
              <div className="stack" style={{ marginTop: 10, '--gap': '6px' }}>
                {f.steps.map((st, i) => (
                  <div key={st.id} className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
                    <span className="xs muted" style={{ width: 18 }}>{i + 1}</span>
                    <input className="input tight grow" value={st.text} placeholder={st.preset ? tl(st.preset) : ''} onChange={(e) => setFlow((cur) => { cur.steps[i].text = e.target.value; return cur; })} aria-label={t('client.flows.stepLabel', { n: i + 1 })} />
                    <select className="select input tight" style={{ width: 140, flex: 'none' }} value={st.type} onChange={(e) => setFlow((cur) => { cur.steps[i].type = e.target.value; return cur; })}>
                      {FLOW_STEP_TYPES.map((o) => <option key={o.id} value={o.id}>{tl(o.label)}</option>)}
                    </select>
                    <label className="xs muted nowrap" title={t('estimates.branches')}>
                      {t('estimates.branchesShort')}
                      <input className="input tight num" style={{ width: 52, marginLeft: 4 }} type="number" min="0" value={(st.branches || []).length} onChange={(e) => setFlow((cur) => { const n = Math.max(0, Number(e.target.value) || 0); const b = cur.steps[i].branches || []; cur.steps[i].branches = n > b.length ? [...b, ...Array.from({ length: n - b.length }, () => ({ id: uid('b'), text: '' }))] : b.slice(0, n); return cur; })} />
                    </label>
                    <button className="btn small ghost" onClick={() => setFlow((cur) => { cur.steps.splice(i, 1); return cur; })}>×</button>
                  </div>
                ))}
                <div><button className="btn small" onClick={() => setFlow((cur) => { cur.steps.push({ id: uid('st'), type: 'other', preset: null, text: '', branches: [], unsure: false }); return cur; })}>{t('client.flows.addStep')}</button></div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function OverrideRow({ label, system, children, reason, onReason, active }) {
  const { t } = useI18n();
  return (
    <div className="record" style={{ padding: '12px 0' }}>
      <div className="row between" style={{ '--gap': '12px', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="small" style={{ fontWeight: 500 }}>{label}</div>
          <div className="xs muted">{t('estimates.systemValue', { v: system })}</div>
        </div>
        <div style={{ width: 260, flex: 'none' }}>{children}</div>
      </div>
      {active && (
        <input className="input tight" style={{ marginTop: 8 }} value={reason || ''} onChange={(e) => onReason(e.target.value)} placeholder={t('estimates.overrideReason')} aria-label={t('estimates.overrideReason')} />
      )}
    </div>
  );
}

function OverridesEditor({ v, eff, upd }) {
  const { t, tl, money, moneyRange } = useI18n();
  const o = v.overrides || {};
  const sys = eff.system;
  const setO = (key, value) => upd((d) => { d.overrides = { ...(d.overrides || {}), [key]: value }; if (value == null || value === '') delete d.overrides[key]; });
  const reason = (key) => ({ reason: v.overrideReasons?.[key], onReason: (r) => upd((d) => { d.overrideReasons = { ...(d.overrideReasons || {}), [key]: r }; }) });
  const levelOpts = (keys) => keys.map((k) => ({ value: k, label: t(`level.${k}`) }));
  const pricing = v.snapshot.pricing;
  const triggered = sys.price.adjustments.filter((a) => a.source === 'rule');
  const [adj, setAdj] = useState({ name: '', kind: 'percent', value: '' });

  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('estimates.overrides')}</h2><SourceTag source="designer" /></div>
      <p className="xs muted">{t('estimates.overridesHint')}</p>

      <OverrideRow label={t('est.effort')} system={`${sys.effort.min}–${sys.effort.max}h`} active={!!o.effort} {...reason('effort')}>
        <div className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
          <NumberInput className="tight" value={o.effort?.min} placeholder={String(sys.effort.min)} onChange={(n) => setO('effort', n == null && o.effort?.max == null ? null : { min: n ?? sys.effort.min, max: o.effort?.max ?? sys.effort.max })} aria-label="min" />
          <span className="muted">–</span>
          <NumberInput className="tight" value={o.effort?.max} placeholder={String(sys.effort.max)} onChange={(n) => setO('effort', n == null && o.effort?.min == null ? null : { min: o.effort?.min ?? sys.effort.min, max: n ?? sys.effort.max })} aria-label="max" />
          <span className="xs muted">h</span>
        </div>
      </OverrideRow>
      <OverrideRow label={t('estimates.screens')} system={sys.counts.screens} active={o.screens != null} {...reason('screens')}>
        <NumberInput className="tight" value={o.screens} placeholder={String(sys.counts.screens)} onChange={(n) => setO('screens', n)} />
      </OverrideRow>
      <OverrideRow label={t('estimates.states')} system={sys.counts.states} active={o.states != null} {...reason('states')}>
        <NumberInput className="tight" value={o.states} placeholder={String(sys.counts.states)} onChange={(n) => setO('states', n)} />
      </OverrideRow>
      <OverrideRow label={t('est.risk')} system={t(`level.${sys.risk.level}`)} active={!!o.risk} {...reason('risk')}>
        <Select value={o.risk} onChange={(val) => setO('risk', val)} placeholder={t('estimates.useSystem')} options={levelOpts(['low', 'medium', 'high'])} />
      </OverrideRow>
      <OverrideRow label={t('est.confidence')} system={t(`level.${sys.confidence.level}`)} active={!!o.confidence} {...reason('confidence')}>
        <Select value={o.confidence} onChange={(val) => setO('confidence', val)} placeholder={t('estimates.useSystem')} options={levelOpts(['low', 'medium', 'high'])} />
      </OverrideRow>
      <OverrideRow label={t('est.schedule')} system={sys.schedule.pressure ? t(`level.${sys.schedule.pressure}`) : '—'} active={!!o.schedule} {...reason('schedule')}>
        <Select value={o.schedule} onChange={(val) => setO('schedule', val)} placeholder={t('estimates.useSystem')} options={levelOpts(['low', 'medium', 'high', 'veryHigh'])} />
      </OverrideRow>
      <OverrideRow label={t('estimates.rate')} system={money(pricing.hourlyRate)} active={o.rate != null} {...reason('rate')}>
        <NumberInput className="tight" value={o.rate} placeholder={String(pricing.hourlyRate)} onChange={(n) => setO('rate', n)} />
      </OverrideRow>
      <OverrideRow label={t('estimates.priceRange')} system={moneyRange(sys.price.total)} active={!!o.price} {...reason('price')}>
        <div className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
          <NumberInput className="tight" value={o.price?.min} placeholder={String(eff.price.total.min)} onChange={(n) => setO('price', n == null && o.price?.max == null ? null : { min: n ?? eff.price.total.min, max: o.price?.max ?? eff.price.total.max })} aria-label="min" />
          <span className="muted">–</span>
          <NumberInput className="tight" value={o.price?.max} placeholder={String(eff.price.total.max)} onChange={(n) => setO('price', n == null && o.price?.min == null ? null : { min: o.price?.min ?? eff.price.total.min, max: n ?? eff.price.total.max })} aria-label="max" />
        </div>
      </OverrideRow>
      <OverrideRow label={t('estimates.fixedPrice')} system={t('estimates.fixedPriceSystem')} active={v.fixedPrice != null} reason={v.overrideReasons?.fixedPrice} onReason={(r) => upd((d) => { d.overrideReasons = { ...(d.overrideReasons || {}), fixedPrice: r }; })}>
        <NumberInput className="tight" value={v.fixedPrice} placeholder="—" onChange={(n) => upd((d) => { d.fixedPrice = n; })} />
      </OverrideRow>
      <OverrideRow label={t('estimates.devFee')} system={t('estimates.devFeeSystem')} active={false}>
        <NumberInput className="tight" value={v.developmentFee} placeholder="—" onChange={(n) => upd((d) => { d.developmentFee = n; })} />
      </OverrideRow>

      <div className="sub-title" style={{ margin: '20px 0 6px' }}>{t('estimates.adjustments')}</div>
      {triggered.length === 0 && !(v.ignoredRules || []).length && <p className="xs muted">{t('estimates.noRulesTriggered')}</p>}
      {[...triggered, ...(pricing.adjustments || []).filter((r) => (v.ignoredRules || []).includes(r.id))].map((r) => {
        const ignored = (v.ignoredRules || []).includes(r.id);
        return (
          <label key={r.id} className="check small" style={{ display: 'flex', padding: '4px 0' }}>
            <input type="checkbox" checked={!ignored} onChange={() => upd((d) => { d.ignoredRules = ignored ? d.ignoredRules.filter((x) => x !== r.id) : [...(d.ignoredRules || []), r.id]; })} />
            {tl(r.name)} ({r.kind === 'percent' ? `${r.value}%` : money(r.value)})
          </label>
        );
      })}
      {(v.manualAdjustments || []).map((m, i) => (
        <div key={m.id} className="row between small" style={{ padding: '4px 0' }}>
          <span>{tl(m.name)} ({m.kind === 'percent' ? `${m.value}%` : money(m.value)})</span>
          <button className="btn small ghost" onClick={() => upd((d) => { d.manualAdjustments.splice(i, 1); })}>×</button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8, '--gap': '6px', flexWrap: 'nowrap' }}>
        <input className="input tight grow" value={adj.name} onChange={(e) => setAdj({ ...adj, name: e.target.value })} placeholder={t('estimates.adjustmentName')} aria-label={t('estimates.adjustmentName')} />
        <select className="select input tight" style={{ width: 100, flex: 'none' }} value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}>
          <option value="percent">%</option>
          <option value="fixed">{t('price.fixedAmount')}</option>
        </select>
        <input className="input tight num" style={{ width: 90, flex: 'none' }} type="number" value={adj.value} onChange={(e) => setAdj({ ...adj, value: e.target.value })} aria-label={t('estimates.adjustmentValue')} />
        <button className="btn small" disabled={!adj.name.trim() || adj.value === ''} onClick={() => { upd((d) => { (d.manualAdjustments ||= []).push({ id: uid('m'), name: T(adj.name.trim(), adj.name.trim()), kind: adj.kind, value: Number(adj.value), trigger: 'manual' }); }); setAdj({ name: '', kind: 'percent', value: '' }); }}>{t('common.add')}</button>
      </div>
    </section>
  );
}

/** Edits a list of bilingual text items in the current language. */
function TextListEditor({ items, onChange, placeholder }) {
  const { t, lang } = useI18n();
  const [draft, setDraft] = useState('');
  return (
    <div className="stack" style={{ '--gap': '6px' }}>
      {items.map((item, i) => (
        <div key={i} className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
          <input className="input tight grow" value={textOf(item, lang)} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...(typeof x === 'string' ? { zh: x, en: x } : x), [lang]: e.target.value } : x)))} />
          <button className="btn small ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t('common.delete')}>×</button>
        </div>
      ))}
      <div className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
        <input className="input tight grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button className="btn small" disabled={!draft.trim()} onClick={() => { onChange([...items, { zh: draft.trim(), en: draft.trim() }]); setDraft(''); }}>{t('common.add')}</button>
      </div>
    </div>
  );
}

function ListsEditor({ v, eff, upd }) {
  const { t, tl, lang } = useI18n();
  const sys = eff.system;
  return (
    <section className="panel stack" style={{ '--gap': '22px' }}>
      <div>
        <div className="panel-head" style={{ marginBottom: 8 }}><h2>{t('estimates.assumptions')}</h2></div>
        {sys.assumptions.map((a) => {
          const removed = (v.removedAssumptions || []).includes(a.id);
          return (
            <label key={a.id} className="check small" style={{ display: 'flex', padding: '3px 0' }}>
              <input type="checkbox" checked={!removed} onChange={() => upd((d) => { d.removedAssumptions = removed ? d.removedAssumptions.filter((x) => x !== a.id) : [...(d.removedAssumptions || []), a.id]; })} />
              <span className={removed ? 'strike' : ''}>{tl(a.text)}</span>
              <SourceTag source="system" />
            </label>
          );
        })}
        <div style={{ marginTop: 8 }}>
          <TextListEditor items={(v.extraAssumptions || []).map((x) => x.text)} onChange={(list) => upd((d) => { d.extraAssumptions = list.map((text, i) => ({ id: d.extraAssumptions?.[i]?.id || uid('as'), text })); })} placeholder={t('estimates.addAssumption')} />
        </div>
      </div>
      <div>
        <div className="panel-head" style={{ marginBottom: 8 }}><h2>{t('estimates.unknowns')}</h2></div>
        {sys.unknowns.map((u) => {
          const resolved = (v.resolvedUnknowns || []).includes(u.id);
          return (
            <label key={u.id} className="check small" style={{ display: 'flex', padding: '3px 0' }}>
              <input type="checkbox" checked={resolved} onChange={() => upd((d) => { d.resolvedUnknowns = resolved ? d.resolvedUnknowns.filter((x) => x !== u.id) : [...(d.resolvedUnknowns || []), u.id]; })} />
              <span className={resolved ? 'strike' : ''}>{tl(u.text)}</span>
              <span className="xs faint">{resolved ? t('estimates.resolved') : u.impact === 'high' ? t('est.highImpact') : t('est.mediumImpact')}</span>
            </label>
          );
        })}
        <p className="xs muted" style={{ margin: '6px 0' }}>{t('estimates.resolveHint')}</p>
        <TextListEditor items={(v.extraUnknowns || []).map((x) => x.text)} onChange={(list) => upd((d) => { d.extraUnknowns = list.map((text, i) => ({ id: d.extraUnknowns?.[i]?.id || uid('u'), impact: 'medium', text })); })} placeholder={t('estimates.addUnknown')} />
      </div>
      <div>
        <div className="panel-head" style={{ marginBottom: 8 }}><h2>{t('estimates.deliverables')}</h2></div>
        <TextListEditor items={v.deliverables || sys.deliverables} onChange={(list) => upd((d) => { d.deliverables = list; })} placeholder={t('estimates.addDeliverable')} />
      </div>
      <div>
        <div className="panel-head" style={{ marginBottom: 8 }}><h2>{t('estimates.exclusions')}</h2></div>
        <TextListEditor items={v.exclusions || v.snapshot.pricing.defaultExclusions} onChange={(list) => upd((d) => { d.exclusions = list; })} placeholder={t('estimates.addExclusion')} />
      </div>
      <div>
        <Field label={t('estimates.timelineText')} help={t('estimates.timelineHelp', { v: tl(eff.timelineText) })}>
          <TextInput
            value={v.timelineText ? textOf(v.timelineText, lang) : ''}
            onChange={(val) => upd((d) => {
              const prevText = typeof d.timelineText === 'object' && d.timelineText ? d.timelineText : { zh: val, en: val };
              d.timelineText = val ? { ...prevText, [lang]: val } : '';
            })}
            placeholder={tl(eff.timelineText)}
          />
        </Field>
      </div>
      <p className="xs muted">{t('estimates.bilingualHint')}</p>
    </section>
  );
}

function LockedSummary({ v, eff }) {
  const { t, tl } = useI18n();
  return (
    <>
      {(v.reason || v.notes) && (
        <section className="panel">
          <div className="panel-head"><h2>{t('estimates.reasonTitle')}</h2><SourceTag source="designer" /></div>
          {v.reason && <p className="pre">{v.reason}</p>}
          {v.notes && <p className="pre small muted" style={{ marginTop: 8 }}>{v.notes}</p>}
        </section>
      )}
      {eff.overridden.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>{t('estimates.overrides')}</h2><SourceTag source="designer" /></div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {eff.overridden.map((k) => (
              <li key={k}>{t(`override.${k}`)}{v.overrideReasons?.[k] ? ` — ${v.overrideReasons[k]}` : ''}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <div className="panel-head"><h2>{t('estimates.assumptions')}</h2></div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {eff.assumptions.map((a) => (
            <li key={a.id}>{tl(a.text)} <SourceTag source={a.by === 'designer' ? 'designer' : 'system'} /></li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>{t('estimates.unknowns')}</h2></div>
        <UnknownList unknowns={eff.unknowns} />
      </section>
      <section className="panel">
        <div className="panel-head"><h2>{t('estimates.deliverables')}</h2></div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {eff.deliverables.map((d, i) => <li key={i}>{tl(d)}</li>)}
        </ul>
        <div className="figure-label" style={{ marginTop: 14 }}>{t('estimates.exclusions')}</div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {eff.exclusions.map((d, i) => <li key={i}>{tl(d)}</li>)}
        </ul>
      </section>
    </>
  );
}

function LockModal({ p, v, eff, kind, onClose }) {
  const { t, money } = useI18n();
  const r = v.snapshot.pricing.rounding || 1;
  const mid = Math.round((eff.price.total.min + eff.price.total.max) / 2 / r) * r;
  const [price, setPrice] = useState(v.fixedPrice ?? mid);
  return (
    <Modal
      title={kind === 'final' ? t('estimates.lockFinal') : t('estimates.lockRevised')}
      description={kind === 'final' ? t('estimates.lockFinalHint') : t('estimates.lockHint')}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            disabled={kind === 'final' && !price}
            onClick={() => {
              if (kind === 'final') updateVersion(p.id, v.id, (d) => { d.fixedPrice = Number(price); });
              lockVersion(p.id, v.id, kind);
              toast(t('estimates.lockedToast', { n: v.number }));
              onClose();
            }}
          >
            {t('estimates.lock')}
          </button>
        </>
      }
    >
      {kind === 'final' && (
        <Field label={t('estimates.fixedPrice')} help={t('estimates.fixedPriceHelp', { range: `${money(eff.price.total.min)} – ${money(eff.price.total.max)}` })}>
          <NumberInput value={price} onChange={setPrice} />
        </Field>
      )}
    </Modal>
  );
}

function QuoteModal({ p, v, eff, onClose }) {
  const { t, lang } = useI18n();
  const pricing = v.snapshot.pricing;
  const kind = v.kind === 'final' ? 'final' : v.kind === 'preliminary' ? 'preliminary' : 'revised';
  const [terms, setTerms] = useState({
    revisionRounds: pricing.revisionRounds,
    validityDays: pricing.quoteValidityDays,
    paymentDueDays: pricing.paymentDueDays,
    paymentSchedule: JSON.parse(JSON.stringify(pricing.paymentSchedule)),
    notes: '',
  });
  const total = terms.paymentSchedule.reduce((n, x) => n + Number(x.percent || 0), 0);
  const create = async (andDownload) => {
    const qid = createQuote(p.id, v.id, { kind, status: kind === 'final' ? 'final' : kind === 'revised' ? 'revised' : 'preliminary', ...terms, fixedPrice: eff.fixedPrice });
    onClose();
    toast(kind === 'final' ? t('estimates.finalQuoteCreated') : t('estimates.quoteCreated'));
    if (andDownload && qid) {
      const { getState } = await import('../store/store.js');
      const q = getState().projects[p.id].quotes.find((x) => x.id === qid);
      try {
        await downloadPdf(quoteDocument(q, lang));
      } catch (err) {
        console.error(err);
        toast(t('doc.pdfFailed'));
      }
    }
    if (kind === 'final' && qid) navigate(`/projects/${p.id}/contract`);
  };
  return (
    <Modal
      wide
      title={kind === 'final' ? t('estimates.generateFinalQuote') : t('estimates.generateQuote')}
      description={t('estimates.quoteHint', { n: v.number })}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn" disabled={total !== 100} onClick={() => create(false)}>{t('estimates.createQuote')}</button>
          <button className="btn primary" disabled={total !== 100} onClick={() => create(true)}>{t('estimates.createAndDownload')}</button>
        </>
      }
    >
      <div className="grid-3">
        <Field label={t('pricing.revisionRounds')}><NumberInput value={terms.revisionRounds} onChange={(n) => setTerms({ ...terms, revisionRounds: n ?? 0 })} /></Field>
        <Field label={t('pricing.validity')}><NumberInput value={terms.validityDays} onChange={(n) => setTerms({ ...terms, validityDays: n ?? 30 })} /></Field>
        <Field label={t('pricing.dueDays')}><NumberInput value={terms.paymentDueDays} onChange={(n) => setTerms({ ...terms, paymentDueDays: n ?? 7 })} /></Field>
      </div>
      <div className="sub-title" style={{ margin: '18px 0 8px' }}>{t('pricing.schedule')}</div>
      {terms.paymentSchedule.map((s, i) => (
        <div key={s.id} className="row" style={{ '--gap': '8px', marginBottom: 6, flexWrap: 'nowrap' }}>
          <input className="input tight grow" value={textOf(s.label, lang)} onChange={(e) => setTerms({ ...terms, paymentSchedule: terms.paymentSchedule.map((x, j) => (j === i ? { ...x, label: { ...x.label, [lang]: e.target.value } } : x)) })} />
          <input className="input tight num" style={{ width: 80, flex: 'none' }} type="number" value={s.percent} onChange={(e) => setTerms({ ...terms, paymentSchedule: terms.paymentSchedule.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)) })} />
          <span className="muted">%</span>
          <button className="btn small ghost" onClick={() => setTerms({ ...terms, paymentSchedule: terms.paymentSchedule.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <div className="row between">
        <button className="btn small" onClick={() => setTerms({ ...terms, paymentSchedule: [...terms.paymentSchedule, { id: uid('p'), label: { zh: '', en: '' }, percent: 0 }] })}>{t('pricing.addInstalment')}</button>
        <span className={`small ${total === 100 ? 'muted' : ''}`} style={total !== 100 ? { color: 'var(--brick)' } : undefined}>{t('pricing.total', { n: total })}</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label={t('estimates.quoteNotes')}><TextArea value={terms.notes} onChange={(n) => setTerms({ ...terms, notes: n })} rows={2} /></Field>
      </div>
      <p className="xs muted" style={{ marginTop: 12 }}>{t('estimates.quoteSnapshot')}</p>
    </Modal>
  );
}
