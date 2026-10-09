import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { QUESTIONS, REFERENCE_LIKES, REFERENCE_TYPES, FLOW_STEP_TYPES, isVisible } from '../data/questionnaire.js';
import { FLOW_GOALS, GOALS } from '../data/baseline.js';
import { isEstimateStable, validationSuggestion } from '../engine/estimate.js';
import { moveItem, uid } from '../lib/util.js';
import * as S from './session.js';

const T = (zh, en) => ({ zh, en });

// ---------------------------------------------------------------------------

export function IntroScreen({ invite, session, onStart }) {
  const { t } = useI18n();
  const resumed = Object.keys(session.responses).length > 0;
  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <p className="eyebrow">{invite.projectName}</p>
      <h1 className="q-title" style={{ fontSize: 'var(--fs-3xl)' }}>
        {t('client.intro.hello')}
      </h1>
      <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--ink-2)', maxWidth: '54ch' }}>{t('client.intro.body')}</p>
      <ol className="stack" style={{ '--gap': '10px', paddingLeft: 20, color: 'var(--ink-2)' }}>
        <li>{t('client.intro.step1')}</li>
        <li>{t('client.intro.step2')}</li>
        <li>{t('client.intro.step3')}</li>
      </ol>
      <p className="small muted">{t('client.intro.privacy')}</p>
      <div>
        <button className="btn primary large" onClick={onStart}>{resumed ? t('client.intro.resume') : t('client.intro.start')}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Choices({ qid, q, value, onPick, multi }) {
  const { tl } = useI18n();
  const cols = q.options.length > 6;
  return (
    <div className={`choices${cols ? ' cols' : ''}`} role={multi ? 'group' : 'radiogroup'}>
      {q.options.map((o) => {
        const selected = multi ? (value || []).includes(o.id) : value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            className={`choice${multi ? ' multi' : ''}${o.id === 'unsure' ? ' unsure' : ''}`}
            aria-pressed={selected}
            onClick={() => onPick(o.id)}
            data-q={qid}
            data-o={o.id}
          >
            <span className="mark" aria-hidden="true" />
            <span>{tl(o.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextAnswer({ qid, q, session, update, area }) {
  const { tl } = useI18n();
  const value = session.responses[qid]?.value ?? '';
  const props = {
    className: area ? 'textarea' : 'input',
    value,
    placeholder: q.placeholder ? tl(q.placeholder) : undefined,
    onChange: (e) => update((s) => S.setAnswer(s, qid, e.target.value, { commit: false })),
    onBlur: (e) => update((s) => S.setAnswer(s, qid, e.target.value.trim(), { commit: true })),
    id: `q-${qid}`,
    'data-q': qid,
  };
  return area ? <textarea {...props} /> : <input {...props} type="text" autoComplete="off" />;
}

export function QuestionScreen({ screen, session, update, inputs, snapshot, onFinish }) {
  const { t, tl } = useI18n();
  const answers = S.answersOf(session);
  const visible = screen.questions.filter((qid) => isVisible(qid, answers));
  const showStability = ['roles', 'statuses', 'dataVolume', 'specialCases', 'integrations', 'devices', 'team', 'content', 'tech', 'timeline', 'references'].includes(screen.id);
  const stability = useMemo(() => (showStability && inputs.functions.length ? isEstimateStable(inputs, snapshot, 0.05) : null), [showStability, inputs, snapshot]);
  const highOpen = ['currentState', 'roles', 'integrations', 'contentReadiness', 'deadline'].some((q) => answers[q] == null);

  return (
    <div>
      {visible.map((qid, i) => {
        const q = QUESTIONS[qid];
        const value = answers[qid];
        const isText = q.type === 'text' || q.type === 'textarea';
        return (
          <section key={qid} className="q-block">
              <>
                {isText ? (
                  <label htmlFor={`q-${qid}`} className={`q-title${i > 0 ? ' follow' : ''}`} style={{ display: 'block' }}>{tl(q.title)}</label>
                ) : (
                  <h1 className={`q-title${i > 0 ? ' follow' : ''}`}>{tl(q.title)}</h1>
                )}
                {q.hint && <p className="q-hint">{tl(q.hint)}</p>}
                {q.type === 'single' && <Choices qid={qid} q={q} value={value} onPick={(id) => update((s) => S.setAnswer(s, qid, value === id ? null : id))} />}
                {q.type === 'multi' && <Choices qid={qid} q={q} value={value} multi onPick={(id) => update((s) => S.toggleMulti(s, qid, id))} />}
                {isText && (
                  <div style={{ marginTop: 16 }}>
                    <TextAnswer qid={qid} q={q} session={session} update={update} area={q.type === 'textarea'} />
                  </div>
                )}
                {q.type === 'date' && (
                  <input
                    type="date"
                    className="input"
                    style={{ marginTop: 16, maxWidth: 240 }}
                    value={value || ''}
                    data-q={qid}
                    onChange={(e) => update((s) => S.setAnswer(s, qid, e.target.value || null))}
                  />
                )}
              </>
          </section>
        );
      })}

      {stability?.stable && !highOpen && (
        <div className="note-box" style={{ marginTop: 40 }}>
          <p>{t('client.stable')}</p>
          <button className="btn-link" style={{ marginTop: 6 }} onClick={onFinish}>{t('client.stableAction')}</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ScopeScreen({ session, update, snapshot, fnDefs }) {
  const { t, tl } = useI18n();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState({ name: '', note: '' });
  const goals = (S.answersOf(session).goals || []).filter((g) => GOALS.some((x) => x.id === g));
  const items = session.scope.items;
  const inScope = new Set(items.filter((i) => i.status !== 'removed').map((i) => i.fnId));
  const others = snapshot.functions.filter((f) => !inScope.has(f.id));

  const goalNames = goals.map((g) => tl(GOALS.find((x) => x.id === g).label)).join(t('common.listSep'));

  return (
    <div>
      <h1 className="q-title">{t('client.scope.title')}</h1>
      <p className="q-hint">{goals.length ? t('client.scope.hintGoals', { goals: goalNames }) : t('client.scope.hint')}</p>

      <div style={{ marginTop: 26 }}>
        {items.length === 0 && <p className="muted">{t('client.scope.none')}</p>}
        {items.map((item) => {
          const def = fnDefs[item.fnId];
          if (!def) return null;
          const removed = item.status === 'removed';
          return (
            <div key={item.fnId} className={`fn-item${removed ? ' removed' : ''}`}>
              <div className="fn-head">
                <div className="grow">
                  <div className="fn-name">{tl(def.name)}</div>
                  <div className="xs muted">{tl(def.basic.flow)}</div>
                </div>
                {item.origin === 'added' && <span className="tag plain">{t('client.scope.addedByYou')}</span>}
                <button className="btn small" onClick={() => update((s) => S.setItemStatus(s, item.fnId, removed ? 'kept' : 'removed', def.name))} data-fn={item.fnId}>
                  {removed ? t('client.scope.restore') : t('client.scope.remove')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 22 }}>
        <button className="btn" onClick={() => setAdding((x) => !x)} aria-expanded={adding}>{t('client.scope.addStandard')}</button>
        {adding && (
          <div className="panel" style={{ marginTop: 12 }}>
            {[...GOALS, { id: null, label: T('其他', 'Other') }].map((g) => {
              const list = others.filter((f) => (g.id ? f.goals?.[0] === g.id : !f.goals?.length));
              if (!list.length) return null;
              return (
                <div key={g.id || 'other'} style={{ marginBottom: 14 }}>
                  <div className="xs muted" style={{ marginBottom: 6 }}>{tl(g.label)}</div>
                  <div className="row" style={{ '--gap': '6px' }}>
                    {list.map((f) => (
                      <button key={f.id} className="btn small" onClick={() => update((s) => S.addFunction(s, f.id, f.name))}>+ {tl(f.name)}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <section className="q-block">
        <h2 className="q-title follow">{t('client.scope.customTitle')}</h2>
        <p className="q-hint">{t('client.scope.customHint')}</p>
        {session.scope.custom.map((c) => (
          <div key={c.id} className="fn-item" style={{ marginTop: 10 }}>
            <div className="fn-head">
              <div className="grow">
                <div className="fn-name">{c.name}</div>
                {c.note && <div className="small muted">{c.note}</div>}
              </div>
              <span className="tag assumption">{t('client.scope.needsReview')}</span>
              <button className="btn small ghost" onClick={() => update((s) => S.removeCustom(s, c.id))}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
        <form
          className="stack"
          style={{ marginTop: 16, '--gap': '10px' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!custom.name.trim()) return;
            update((s) => S.addCustom(s, custom.name, custom.note));
            setCustom({ name: '', note: '' });
          }}
        >
          <input className="input" placeholder={t('client.scope.customName')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} aria-label={t('client.scope.customName')} />
          <input className="input" placeholder={t('client.scope.customNote')} value={custom.note} onChange={(e) => setCustom({ ...custom, note: e.target.value })} aria-label={t('client.scope.customNote')} />
          <div>
            <button className="btn" type="submit" disabled={!custom.name.trim()}>{t('client.scope.customAdd')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function LevelsScreen({ session, update, fnDefs }) {
  const { t, tl, lang } = useI18n();
  const items = session.scope.items.filter((i) => i.status !== 'removed' && fnDefs[i.fnId]);
  return (
    <div>
      <h1 className="q-title">{t('client.levels.title')}</h1>
      <p className="q-hint">{t('client.levels.hint')}</p>
      <div style={{ marginTop: 26 }}>
        {items.map((item) => {
          const def = fnDefs[item.fnId];
          const val = def.validation;
          const selected = session.validation[item.fnId] || [];
          const suggestion = validationSuggestion(def, item.level, selected);
          const pick = (level) => update((s) => S.setLevel(s, item.fnId, level, def.name));
          return (
            <div key={item.fnId} className="fn-item" style={{ marginTop: 12 }} data-fn={item.fnId}>
              <div className="fn-head">
                <div className="fn-name grow">{tl(def.name)}</div>
                {item.level === 'unsure' && <span className="tag assumption">{t('client.levels.undecided')}</span>}
              </div>
              <div className="fn-body">
                <div className="fn-levels">
                  {['basic', 'advanced'].map((lv) => (
                    <button key={lv} className="level-card" aria-pressed={item.level === lv} onClick={() => pick(lv)} data-level={lv}>
                      <h4>{lv === 'basic' ? t('client.levels.basic') : t('client.levels.advanced')}</h4>
                      <ul>
                        {(def[lv].scope[lang] || def[lv].scope.zh).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
                <button className="btn-link small" style={{ marginTop: 10 }} onClick={() => pick('unsure')}>{t('client.levels.notSure')}</button>

                {val && (
                  <div style={{ marginTop: 16 }}>
                    <div className="small" style={{ fontWeight: 500, marginBottom: 8 }}>{tl(val.question)}</div>
                    <div className="row" style={{ '--gap': '6px' }}>
                      {val.options.map((o) => {
                        const on = selected.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            className="choice multi"
                            style={{ width: 'auto', padding: '8px 12px' }}
                            aria-pressed={on}
                            onClick={() => update((s) => S.setValidation(s, item.fnId, on ? selected.filter((x) => x !== o.id) : [...selected, o.id]))}
                          >
                            <span className="mark" aria-hidden="true" />
                            <span className="small">{tl(o.label)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {suggestion && !session.validationAck[item.fnId] && (
                  <div className="warn-box" style={{ marginTop: 14 }}>
                    <p>{suggestion === 'basic' ? t('client.levels.suggestBasic') : t('client.levels.suggestAdvanced')}</p>
                    <div className="row" style={{ marginTop: 10, '--gap': '8px' }}>
                      <button className="btn small primary" onClick={() => pick(suggestion)}>
                        {suggestion === 'basic' ? t('client.levels.switchBasic') : t('client.levels.switchAdvanced')}
                      </button>
                      <button className="btn small" onClick={() => update((s) => S.ackValidation(s, item.fnId, def.name, item.level))}>
                        {item.level === 'advanced' ? t('client.levels.keepAdvanced') : t('client.levels.keepBasic')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function FlowsScreen({ session, update, flowGoals }) {
  const { t, tl } = useI18n();
  return (
    <div>
      <h1 className="q-title">{t('client.flows.title')}</h1>
      <p className="q-hint">{t('client.flows.hint')}</p>
      {flowGoals.map((g) => {
        const def = FLOW_GOALS[g];
        const flow = session.flows[g];
        const mode = flow?.mode || null;
        return (
          <section key={g} className="q-block" data-flow={g}>
            <h2 className="q-title follow">{tl(def.name)}</h2>
            <ol className="small muted" style={{ marginTop: 10, paddingLeft: 20 }}>
              {def.steps.map((st, i) => (
                <li key={i}>{tl(st.label)}</li>
              ))}
            </ol>
            <div className="choices">
              {[
                ['standard', t('client.flows.standard')],
                ['custom', t('client.flows.custom')],
                ['unsure', t('client.flows.unsure')],
              ].map(([m, label]) => (
                <button key={m} className={`choice${m === 'unsure' ? ' unsure' : ''}`} aria-pressed={mode === m} onClick={() => update((s) => S.setFlowMode(s, g, m))} data-mode={m}>
                  <span className="mark" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {mode === 'standard' && <p className="note-box" style={{ marginTop: 12 }}>{t('client.flows.standardNote')}</p>}
            {mode === 'custom' && <FlowBuilder goal={g} steps={flow.steps || []} update={update} />}
          </section>
        );
      })}
    </div>
  );
}

function FlowBuilder({ goal, steps, update }) {
  const { t, tl } = useI18n();
  const set = (next, note) => update((s) => S.updateFlowSteps(s, goal, next, note));
  const name = FLOW_GOALS[goal].name;
  const patch = (i, p) => set(steps.map((st, j) => (j === i ? { ...st, ...p } : st)));
  return (
    <div style={{ marginTop: 18 }}>
      <p className="small muted">{t('client.flows.builderHint')}</p>
      <ol className="flow-steps">
        {steps.map((st, i) => (
          <li key={st.id} className="flow-step">
            <div className="stack" style={{ '--gap': '8px' }}>
              <div className="row" style={{ '--gap': '8px', flexWrap: 'nowrap' }}>
                <input
                  className="input tight grow"
                  value={st.text}
                  placeholder={st.preset ? tl(st.preset) : t('client.flows.stepPlaceholder')}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  aria-label={t('client.flows.stepLabel', { n: i + 1 })}
                />
                <select className="select input tight" style={{ width: 170, flex: 'none' }} value={st.type} onChange={(e) => patch(i, { type: e.target.value })} aria-label={t('client.flows.stepType')}>
                  {FLOW_STEP_TYPES.map((o) => (
                    <option key={o.id} value={o.id}>{tl(o.label)}</option>
                  ))}
                </select>
              </div>
              {(st.branches || []).length > 0 && (
                <div className="flow-branch">
                  {st.branches.map((b, bi) => (
                    <div key={b.id} className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
                      <span className="xs muted nowrap">{t('client.flows.branch')}</span>
                      <input
                        className="input tight grow"
                        value={b.text}
                        placeholder={t('client.flows.branchPlaceholder')}
                        onChange={(e) => patch(i, { branches: st.branches.map((x, k) => (k === bi ? { ...x, text: e.target.value } : x)) })}
                      />
                      <button className="btn small ghost" onClick={() => patch(i, { branches: st.branches.filter((_, k) => k !== bi) })} aria-label={t('common.delete')}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="row" style={{ '--gap': '14px' }}>
                <button className="btn-link xs" onClick={() => set(steps.map((x, j) => (j === i ? { ...x, branches: [...(x.branches || []), { id: uid('b'), text: '' }] } : x)), T(`客戶在${name.zh}第 ${i + 1} 步新增分支`, `Client added a branch at step ${i + 1} of the ${name.en.toLowerCase()}`))}>
                  {t('client.flows.addBranch')}
                </button>
                <label className="check xs">
                  <input type="checkbox" checked={!!st.unsure} onChange={(e) => patch(i, { unsure: e.target.checked })} />
                  {t('client.flows.stepUnsure')}
                </label>
              </div>
            </div>
            <div className="row" style={{ '--gap': '2px', flexWrap: 'nowrap' }}>
              <button className="btn small ghost" disabled={i === 0} onClick={() => set(moveItem(steps, i, -1))} aria-label={t('common.moveUp')}>↑</button>
              <button className="btn small ghost" disabled={i === steps.length - 1} onClick={() => set(moveItem(steps, i, 1))} aria-label={t('common.moveDown')}>↓</button>
              <button className="btn small ghost" onClick={() => set(steps.filter((_, j) => j !== i), T(`客戶刪除${name.zh}的一個步驟`, `Client removed a step from the ${name.en.toLowerCase()}`))} aria-label={t('common.delete')}>×</button>
            </div>
          </li>
        ))}
      </ol>
      <button
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => set([...steps, { id: uid('st'), type: 'other', preset: null, text: '', branches: [], unsure: false }], T(`客戶在${name.zh}新增步驟`, `Client added a step to the ${name.en.toLowerCase()}`))}
      >
        {t('client.flows.addStep')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReferencesScreen({ session, update }) {
  const { t, tl } = useI18n();
  const [draft, setDraft] = useState({ type: 'visual', link: '', note: '', likes: [] });
  const refs = session.references || [];
  const add = () => {
    if (!draft.link.trim() && !draft.note.trim()) return;
    const ref = { id: uid('r'), ...draft, link: draft.link.trim(), note: draft.note.trim(), at: new Date().toISOString() };
    update((s) => S.setReferences(s, [...refs, ref], T(`客戶新增參考資料：${ref.link || ref.note}`, `Client added a reference: ${ref.link || ref.note}`)));
    setDraft({ type: draft.type, link: '', note: '', likes: [] });
  };
  return (
    <div>
      <h1 className="q-title">{t('client.refs.title')}</h1>
      <p className="q-hint">{t('client.refs.hint')}</p>

      {refs.map((r) => (
        <div key={r.id} className="fn-item" style={{ marginTop: 12 }}>
          <div className="fn-head">
            <div className="grow">
              <div className="xs muted">{tl(REFERENCE_TYPES.find((x) => x.id === r.type)?.label)}</div>
              <div className="fn-name" style={{ wordBreak: 'break-all' }}>{r.link || r.note}</div>
              {r.link && r.note && <div className="small muted">{r.note}</div>}
              {r.likes.length > 0 && <div className="small" style={{ marginTop: 4 }}>{t('client.refs.likes')}{t('common.colon')}{r.likes.map((l) => tl(REFERENCE_LIKES.find((x) => x.id === l)?.label)).join(t('common.listSep'))}</div>}
            </div>
            <button className="btn small ghost" onClick={() => update((s) => S.setReferences(s, refs.filter((x) => x.id !== r.id)))}>{t('common.delete')}</button>
          </div>
        </div>
      ))}

      <div className="panel stack" style={{ marginTop: 22, '--gap': '14px' }}>
        <div className="field">
          <label htmlFor="ref-type">{t('client.refs.type')}</label>
          <select id="ref-type" className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {REFERENCE_TYPES.map((o) => (
              <option key={o.id} value={o.id}>{tl(o.label)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ref-link">{t('client.refs.link')}</label>
          <input id="ref-link" className="input" value={draft.link} placeholder="https://" onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ref-note">{t('client.refs.note')}</label>
          <input id="ref-note" className="input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </div>
        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>{t('client.refs.likesQuestion')}</div>
          <div className="row" style={{ '--gap': '6px' }}>
            {REFERENCE_LIKES.map((o) => {
              const on = draft.likes.includes(o.id);
              return (
                <button key={o.id} className="choice multi" style={{ width: 'auto', padding: '7px 12px' }} aria-pressed={on} onClick={() => setDraft({ ...draft, likes: on ? draft.likes.filter((x) => x !== o.id) : [...draft.likes, o.id] })}>
                  <span className="mark" aria-hidden="true" />
                  <span className="small">{tl(o.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <button className="btn" onClick={add} disabled={!draft.link.trim() && !draft.note.trim()}>{t('client.refs.add')}</button>
        </div>
        <p className="xs muted">{t('client.refs.notRequirement')}</p>
      </div>
    </div>
  );
}

