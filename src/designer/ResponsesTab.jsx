// Every client answer, its history, and anything the designer added —
// always labelled by source, never blended.
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { QUESTIONS, REFERENCE_LIKES, REFERENCE_TYPES, SCREENS, FLOW_STEP_TYPES } from '../data/questionnaire.js';
import { FLOW_GOALS } from '../data/baseline.js';
import { answerText } from '../engine/versions.js';
import { clearDesignerEntry, setDesignerEntry } from '../store/actions.js';
import { Empty, Field, Modal, SourceTag, TextArea } from '../components/ui.jsx';
import { isEmptyAnswer } from '../lib/util.js';
import { SCREEN_NAMES } from '../client/session.js';

export default function ResponsesTab({ p }) {
  const { t, tl } = useI18n();
  const [editing, setEditing] = useState(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const functions = useStore((s) => s.settings.baseline.functions);
  const session = p.clientSession;
  const responses = session?.responses || {};

  const allFns = useMemo(
    () => Object.fromEntries([...functions, ...(session?.snapshotUsed?.functions || [])].map((f) => [f.id, f])),
    [functions, session],
  );

  if (!session && !Object.keys(p.designerEntries).length && !showEmpty) {
    return (
      <Empty title={t('responses.emptyTitle')} action={<button className="btn" onClick={() => setShowEmpty(true)}>{t('responses.enterYourself')}</button>}>
        {t('responses.emptyBody')}
      </Empty>
    );
  }

  return (
    <div className="two-col">
      <div className="stack" style={{ '--gap': '24px' }}>
        <div className="row small muted" style={{ '--gap': '10px' }}>
          <span>{t('responses.legend')}</span>
          <SourceTag source="client" />
          <SourceTag source="system" />
          <SourceTag source="designer" />
          <SourceTag source="assumption" />
        </div>

        {SCREENS.map((screen) => {
          if (screen.custom === 'scope') return <ScopeRecord key="scope" session={session} fnDefs={allFns} />;
          if (screen.custom === 'levels') return null;
          if (screen.custom === 'flows') return <FlowRecord key="flows" session={session} />;
          if (screen.custom === 'references') return <ReferenceRecord key="refs" session={session} />;
          const rows = screen.questions.filter((qid) => {
            const has = responses[qid] && !isEmptyAnswer(responses[qid].value);
            return has || p.designerEntries[qid] || showEmpty;
          });
          if (!rows.length) return null;
          return (
            <section key={screen.id} className="panel">
              <div className="panel-head"><h2>{tl(SCREEN_NAMES[screen.id])}</h2></div>
              {rows.map((qid) => (
                <AnswerRecord key={qid} qid={qid} r={responses[qid]} d={p.designerEntries[qid]} onEdit={() => setEditing(qid)} onClear={() => clearDesignerEntry(p.id, qid)} />
              ))}
            </section>
          );
        })}
        <button className="btn-link small" onClick={() => setShowEmpty((x) => !x)}>{showEmpty ? t('responses.hideEmpty') : t('responses.showEmpty')}</button>
      </div>

      <aside className="stack" style={{ '--gap': '24px' }}>
        <InformationHistory p={p} />
      </aside>

      {editing && <DesignerAnswerModal p={p} qid={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AnswerRecord({ qid, r, d, onEdit, onClear }) {
  const { t, tl, dateTime } = useI18n();
  const q = QUESTIONS[qid];
  const hasClient = r && !isEmptyAnswer(r.value);
  return (
    <div className="record">
      <div className="record-q">{tl(q.title)}</div>
      {hasClient ? (
        <>
          <div className="record-a">{tl(answerText(qid, r.value))}</div>
          <div className="record-meta">
            <SourceTag source="client" />
            <span>{t('responses.updated', { time: dateTime(r.committedAt || r.at) })}</span>
            {r.history?.length > 0 && <span>{t('responses.changedTimes', { n: r.history.length })}</span>}
          </div>
          {r.history?.length > 0 && (
            <div className="history">
              {r.history.map((h, i) => (
                <div key={i}>
                  <span className="h-time">{dateTime(h.at)}</span>
                  <span className="strike">{tl(answerText(qid, h.value))}</span>
                </div>
              ))}
              <div>
                <span className="h-time">{dateTime(r.committedAt || r.at)}</span>
                <span>{tl(answerText(qid, r.value))}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="record-a faint">{t('responses.noClientAnswer')}</div>
      )}
      {d && (
        <div className="note-box" style={{ marginTop: 10 }}>
          <div className="row between" style={{ '--gap': '8px' }}>
            <span><SourceTag source="designer" /> <span className="small">{tl(answerText(qid, d.value))}</span></span>
            <span className="xs muted">{dateTime(d.at)}</span>
          </div>
          {d.reason && <p className="xs" style={{ marginTop: 6 }}>{t('responses.reason')}: {d.reason}</p>}
          <p className="xs muted" style={{ marginTop: 4 }}>{t('responses.designerOverridesNote')}</p>
        </div>
      )}
      <div className="row" style={{ marginTop: 8, '--gap': '14px' }}>
        <button className="btn-link xs" onClick={onEdit}>{d ? t('responses.editDesigner') : t('responses.addDesigner')}</button>
        {d && <button className="btn-link xs" onClick={onClear}>{t('responses.removeDesigner')}</button>}
      </div>
    </div>
  );
}

function DesignerAnswerModal({ p, qid, onClose }) {
  const { t, tl } = useI18n();
  const q = QUESTIONS[qid];
  const initial = p.designerEntries[qid]?.value ?? p.clientSession?.responses?.[qid]?.value ?? (q.type === 'multi' ? [] : '');
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState('');
  const toggle = (id) => {
    if (q.type === 'multi') setValue((v) => ((v || []).includes(id) ? v.filter((x) => x !== id) : [...(v || []).filter((x) => !q.exclusive?.includes(x)), id]));
    else setValue(id);
  };
  return (
    <Modal
      title={t('responses.designerAnswer')}
      description={tl(q.title)}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={() => { setDesignerEntry(p.id, qid, value, reason); onClose(); }}>{t('common.save')}</button>
        </>
      }
    >
      {q.options ? (
        <div className="stack" style={{ '--gap': '6px' }}>
          {q.options.map((o) => (
            <label key={o.id} className="check">
              <input type={q.type === 'multi' ? 'checkbox' : 'radio'} name="designer-answer" checked={q.type === 'multi' ? (value || []).includes(o.id) : value === o.id} onChange={() => toggle(o.id)} />
              {tl(o.label)}
            </label>
          ))}
        </div>
      ) : q.type === 'date' ? (
        <input type="date" className="input" value={value || ''} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <TextArea value={value} onChange={setValue} rows={3} />
      )}
      <div style={{ marginTop: 16 }}>
        <Field label={t('responses.reasonLabel')} help={t('responses.reasonHelp')}>
          <TextArea value={reason} onChange={setReason} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function ScopeRecord({ session, fnDefs }) {
  const { t, tl, dateTime } = useI18n();
  if (!session) return null;
  const items = session.scope.items;
  const levelText = (l) => (l ? (l === 'unsure' ? t('client.levels.undecided') : l === 'basic' ? 'Basic' : 'Advanced') : t('responses.levelNotChosen'));
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('responses.scopeTitle')}</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>{t('responses.fn')}</th><th>{t('responses.origin')}</th><th>{t('responses.level')}</th><th>{t('responses.validation')}</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const def = fnDefs[i.fnId];
              const val = session.validation?.[i.fnId] || [];
              return (
                <tr key={i.fnId}>
                  <td className={i.status === 'removed' ? 'strike' : ''}>{def ? tl(def.name) : i.fnId}</td>
                  <td>
                    {i.origin === 'suggested' ? <SourceTag source="system" /> : <SourceTag source="client" />}
                    {i.status === 'removed' && <div className="xs muted" style={{ marginTop: 4 }}>{t('responses.removedByClient')}</div>}
                  </td>
                  <td>
                    {levelText(i.level)}
                    {(i.levelHistory || []).length > 1 && (
                      <div className="xs muted">{i.levelHistory.map((h) => levelText(h.to)).join(' → ')}</div>
                    )}
                  </td>
                  <td className="small">
                    {val.length ? val.map((id) => tl(def?.validation?.options.find((o) => o.id === id)?.label)).join(t('common.listSep')) : '—'}
                    {session.validationAck?.[i.fnId] && <div className="xs muted">{t('responses.keptDespite')}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {session.scope.custom.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="sub-title" style={{ marginBottom: 6 }}>{t('responses.customTitle')}</div>
          {session.scope.custom.map((c) => (
            <div key={c.id} className="record">
              <div className="record-a">{c.name}</div>
              {c.note && <div className="small muted">{c.note}</div>}
              <div className="record-meta"><SourceTag source="client" /><span>{dateTime(c.at)}</span><span className="tag assumption">{t('client.scope.needsReview')}</span></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FlowRecord({ session }) {
  const { t, tl } = useI18n();
  const flows = Object.entries(session?.flows || {});
  if (!flows.length) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('responses.flowsTitle')}</h2></div>
      {flows.map(([g, f]) => (
        <div key={g} className="record">
          <div className="record-q">{tl(FLOW_GOALS[g]?.name)}</div>
          <div className="record-a">{t(`responses.flowMode.${f.mode}`)}</div>
          {f.mode === 'custom' && (
            <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {f.steps.map((st) => (
                <li key={st.id}>
                  {st.text || tl(st.preset) || t('responses.unnamedStep')}
                  <span className="muted"> · {tl(FLOW_STEP_TYPES.find((x) => x.id === st.type)?.label)}</span>
                  {st.unsure && <span className="tag assumption" style={{ marginLeft: 6 }}>{t('responses.stepUnsure')}</span>}
                  {(st.branches || []).map((b) => (
                    <div key={b.id} className="xs muted">↳ {b.text || t('responses.unnamedBranch')}</div>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

function ReferenceRecord({ session }) {
  const { t, tl } = useI18n();
  const refs = session?.references || [];
  if (!refs.length) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('responses.refsTitle')}</h2></div>
      {refs.map((r) => (
        <div key={r.id} className="record">
          <div className="record-q">{tl(REFERENCE_TYPES.find((x) => x.id === r.type)?.label)}</div>
          <div className="record-a" style={{ wordBreak: 'break-all' }}>{r.link ? <a href={r.link} target="_blank" rel="noreferrer noopener">{r.link}</a> : r.note}</div>
          {r.link && r.note && <div className="small muted">{r.note}</div>}
          {r.likes?.length > 0 && <div className="small">{r.likes.map((l) => tl(REFERENCE_LIKES.find((x) => x.id === l)?.label)).join(t('common.listSep'))}</div>}
        </div>
      ))}
      <p className="xs muted">{t('client.refs.notRequirement')}</p>
    </section>
  );
}

function InformationHistory({ p }) {
  const { t, tl, dateTime } = useI18n();
  const items = [
    ...(p.clientSession?.activity || []).map((a) => ({ ...a, source: a.actor })),
    ...Object.entries(p.designerEntries).flatMap(([qid, d]) => [
      ...d.history.map((h) => ({ at: h.at, source: 'designer', text: { zh: `設計師補充「${QUESTIONS[qid].title.zh}」：${answerText(qid, h.value).zh}`, en: `Designer added "${QUESTIONS[qid].title.en}": ${answerText(qid, h.value).en}` } })),
      { at: d.at, source: 'designer', text: { zh: `設計師補充「${QUESTIONS[qid].title.zh}」：${answerText(qid, d.value).zh}`, en: `Designer added "${QUESTIONS[qid].title.en}": ${answerText(qid, d.value).en}` } },
    ]),
    ...p.infoItems.map((i) => ({ at: i.at, source: i.kind === 'assumption' ? 'assumption' : 'designer', text: { zh: i.text, en: i.text } })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('responses.historyTitle')}</h2></div>
      {!items.length && <p className="muted small">{t('responses.historyEmpty')}</p>}
      <div className="stack" style={{ '--gap': '0' }}>
        {items.slice(0, 120).map((e, i) => (
          <div key={i} className="record" style={{ padding: '10px 0' }}>
            <div className="row" style={{ '--gap': '8px' }}>
              <span className="xs muted num">{dateTime(e.at)}</span>
              <SourceTag source={e.source} />
            </div>
            <div className="small" style={{ marginTop: 4 }}>{tl(e.text)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
