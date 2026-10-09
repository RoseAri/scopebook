// My Baseline: the designer's own function library and complexity rules.
// Starter values are a reference only; the estimation engine reads this copy.
import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { updateSettings } from '../store/actions.js';
import { GOALS, STARTER_FUNCTIONS, STARTER_RULES } from '../data/baseline.js';
import { Confirm, Field, Modal, NumberInput, TextArea, TextInput, toast } from '../components/ui.jsx';
import { clone, uid } from '../lib/util.js';

const TAGS = ['entry', 'roleSensitive', 'stateful', 'dataHeavy', 'transactional'];

export default function BaselinePage() {
  const { t, tl } = useI18n();
  const baseline = useStore((s) => s.settings.baseline);
  const [editing, setEditing] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('baseline.title')}</h1>
          <p className="lede">{t('baseline.lede')}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setConfirmReset(true)}>{t('baseline.resetAll')}</button>
          <button className="btn primary" onClick={() => setEditing('new')}>{t('baseline.addFunction')}</button>
        </div>
      </div>

      <section className="panel flush table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('baseline.function')}</th>
              <th>{t('baseline.goals')}</th>
              <th className="r">Basic</th>
              <th className="r">Advanced</th>
              <th className="r">{t('baseline.screensStates')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {baseline.functions.map((f) => {
              const starter = STARTER_FUNCTIONS.find((s) => s.id === f.id);
              const changed = starter && JSON.stringify({ ...starter, starter: undefined }) !== JSON.stringify({ ...f, starter: undefined });
              return (
                <tr key={f.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{tl(f.name)}</div>
                    <div className="xs muted">
                      {(f.tags || []).map((tag) => t(`tag.${tag}`)).join(t('common.listSep'))}
                      {!starter && <span className="tag designer" style={{ marginLeft: 6 }}>{t('baseline.mine')}</span>}
                      {changed && <span className="tag plain" style={{ marginLeft: 6 }}>{t('baseline.edited')}</span>}
                    </div>
                  </td>
                  <td className="small muted">{(f.goals || []).map((g) => tl(GOALS.find((x) => x.id === g)?.label)).join(t('common.listSep'))}</td>
                  <td className="r num">{f.basic.effort}h</td>
                  <td className="r num">{f.advanced.effort}h</td>
                  <td className="r num small muted">{f.basic.screens}/{f.basic.states} · {f.advanced.screens}/{f.advanced.states}</td>
                  <td className="r"><button className="btn small" onClick={() => setEditing(f.id)}>{t('common.edit')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <RulesEditor />

      {editing && <FunctionModal id={editing} onClose={() => setEditing(null)} />}
      {confirmReset && (
        <Confirm
          title={t('baseline.resetAll')}
          message={t('baseline.resetAllBody')}
          confirmLabel={t('baseline.resetAll')}
          danger
          onClose={() => setConfirmReset(false)}
          onConfirm={() => { updateSettings((s) => { s.baseline = clone({ functions: STARTER_FUNCTIONS, rules: STARTER_RULES }); }); toast(t('baseline.resetDone')); }}
        />
      )}
    </div>
  );
}

const linesToList = (text) => text.split('\n').map((x) => x.trim()).filter(Boolean);

function blankFunction() {
  const lv = { effort: 4, screens: 1, states: 3, scope: { zh: [], en: [] }, flow: { zh: '', en: '' } };
  return { id: uid('fn-'), goals: [], tags: [], name: { zh: '', en: '' }, basic: clone(lv), advanced: { ...clone(lv), effort: 8, screens: 2, states: 5 }, validation: null };
}

function FunctionModal({ id, onClose }) {
  const { t, tl } = useI18n();
  const functions = useStore((s) => s.settings.baseline.functions);
  const existing = functions.find((f) => f.id === id);
  const starter = STARTER_FUNCTIONS.find((f) => f.id === id);
  const [f, setF] = useState(() => clone(existing || blankFunction()));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (fn) => setF((cur) => { const next = clone(cur); fn(next); return next; });

  const save = () => {
    if (!f.name.zh.trim() && !f.name.en.trim()) return;
    if (!f.name.zh) f.name.zh = f.name.en;
    if (!f.name.en) f.name.en = f.name.zh;
    updateSettings((s) => {
      const i = s.baseline.functions.findIndex((x) => x.id === f.id);
      if (i >= 0) s.baseline.functions[i] = f;
      else s.baseline.functions.push(f);
    });
    toast(t('baseline.saved'));
    onClose();
  };

  const levelFields = (lv) => (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="grid-3">
        <Field label={t('baseline.effort')}><NumberInput value={f[lv].effort} onChange={(n) => patch((d) => { d[lv].effort = n ?? 0; })} /></Field>
        <Field label={t('baseline.screens')}><NumberInput value={f[lv].screens} onChange={(n) => patch((d) => { d[lv].screens = n ?? 0; })} /></Field>
        <Field label={t('baseline.states')}><NumberInput value={f[lv].states} onChange={(n) => patch((d) => { d[lv].states = n ?? 0; })} /></Field>
      </div>
      <div className="grid-2">
        <Field label={t('baseline.scopeZh')}><TextArea rows={4} value={f[lv].scope.zh.join('\n')} onChange={(v) => patch((d) => { d[lv].scope.zh = linesToList(v); })} /></Field>
        <Field label={t('baseline.scopeEn')}><TextArea rows={4} value={f[lv].scope.en.join('\n')} onChange={(v) => patch((d) => { d[lv].scope.en = linesToList(v); })} /></Field>
      </div>
      <div className="grid-2">
        <Field label={t('baseline.flowZh')}><TextInput value={f[lv].flow.zh} onChange={(v) => patch((d) => { d[lv].flow.zh = v; })} /></Field>
        <Field label={t('baseline.flowEn')}><TextInput value={f[lv].flow.en} onChange={(v) => patch((d) => { d[lv].flow.en = v; })} /></Field>
      </div>
    </div>
  );

  return (
    <Modal
      wide
      title={existing ? tl(existing.name) : t('baseline.addFunction')}
      onClose={onClose}
      actions={
        <>
          {existing && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>{t('common.delete')}</button>}
          {starter && <button className="btn ghost" onClick={() => setF(clone(starter))}>{t('baseline.resetFunction')}</button>}
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={save}>{t('common.save')}</button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="grid-2">
          <Field label={t('baseline.nameZh')}><TextInput value={f.name.zh} onChange={(v) => patch((d) => { d.name.zh = v; })} /></Field>
          <Field label={t('baseline.nameEn')}><TextInput value={f.name.en} onChange={(v) => patch((d) => { d.name.en = v; })} /></Field>
        </div>
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>{t('baseline.suggestedFor')}</div>
          <div className="row" style={{ '--gap': '4px 14px' }}>
            {GOALS.map((g) => (
              <label key={g.id} className="check xs">
                <input type="checkbox" checked={f.goals.includes(g.id)} onChange={(e) => patch((d) => { d.goals = e.target.checked ? [...d.goals, g.id] : d.goals.filter((x) => x !== g.id); })} />
                {tl(g.label)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>{t('baseline.tags')}</div>
          <div className="row" style={{ '--gap': '4px 14px' }}>
            {TAGS.map((tag) => (
              <label key={tag} className="check xs" title={t(`tag.${tag}.help`)}>
                <input type="checkbox" checked={f.tags.includes(tag)} onChange={(e) => patch((d) => { d.tags = e.target.checked ? [...d.tags, tag] : d.tags.filter((x) => x !== tag); })} />
                {t(`tag.${tag}`)}
              </label>
            ))}
          </div>
          <p className="xs muted" style={{ marginTop: 6 }}>{t('baseline.tagsHelp')}</p>
        </div>
        <hr className="hr" style={{ margin: '4px 0' }} />
        <div className="sub-title">Basic</div>
        {levelFields('basic')}
        <hr className="hr" style={{ margin: '4px 0' }} />
        <div className="sub-title">Advanced</div>
        {levelFields('advanced')}
        {f.validation && <p className="xs muted">{t('baseline.validationNote', { q: tl(f.validation.question) })}</p>}
      </div>
      {confirmDelete && (
        <Confirm
          title={t('baseline.deleteTitle')}
          message={t('baseline.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => { updateSettings((s) => { s.baseline.functions = s.baseline.functions.filter((x) => x.id !== id); }); onClose(); }}
        />
      )}
    </Modal>
  );
}

// Each rule: [path, unit] grouped by section.
const RULE_GROUPS = [
  { key: 'projectOverhead', fields: [['hours', 'h']] },
  { key: 'flow', fields: [['moderatePct', '%'], ['highPct', '%']] },
  { key: 'states', fields: [['fewPct', '%'], ['manyPct', '%'], ['fewStateFactor', '×'], ['manyStateFactor', '×']] },
  { key: 'roles', fields: [['somePct', '%'], ['veryPct', '%'], ['someScreenFactor', '×'], ['veryScreenFactor', '×']] },
  { key: 'data', fields: [['moderatePct', '%'], ['heavyPct', '%']] },
  { key: 'responsive', fields: [['primaryPct', '%'], ['bothPct', '%'], ['multiPct', '%']] },
  { key: 'coordination', fields: [['lightPct', '%'], ['moderatePct', '%'], ['heavyPct', '%']] },
  { key: 'existing', fields: [['redesign', 'h'], ['partial', 'h'], ['addFeatures', 'h'], ['continue', 'h'], ['unsure', 'h'], ['manualProcess', 'h']] },
  { key: 'exceptions', nested: 'hours', fields: [['cancel', 'h'], ['paymentFail', 'h'], ['approvals', 'h'], ['capacity', 'h']] },
  { key: 'integrations', nested: 'hours', risk: true, fields: [['payment', 'h'], ['maps', 'h'], ['erp', 'h'], ['crm', 'h'], ['messaging', 'h'], ['other', 'h']] },
  { key: 'tech', nested: 'hours', risk: true, fields: [['cms', 'h'], ['designSystem', 'h'], ['api', 'h'], ['devices', 'h'], ['architecture', 'h'], ['other', 'h']] },
  { key: 'content', nested: 'pct', risk: true, fields: [['partial', '%'], ['notStarted', '%'], ['designerHelp', '%'], ['unsure', '%']] },
];

function RulesEditor() {
  const { t } = useI18n();
  const rules = useStore((s) => s.settings.baseline.rules);
  const set = (group, field, nested, value) => updateSettings((s) => {
    if (nested) s.baseline.rules[group][field][nested] = value ?? 0;
    else s.baseline.rules[group][field] = value ?? 0;
  });
  const setRisk = (group, field, value) => updateSettings((s) => { s.baseline.rules[group][field].risk = value; });
  return (
    <section style={{ marginTop: 40 }}>
      <h2 className="section-title">{t('rules.title')}</h2>
      <p className="muted small" style={{ margin: '6px 0 18px', maxWidth: '72ch' }}>{t('rules.lede')}</p>
      <div className="grid-2" style={{ gap: 20 }}>
        {RULE_GROUPS.map((g) => (
          <div key={g.key} className="panel">
            <div className="panel-head"><h3>{t(`rules.${g.key}`)}</h3></div>
            <p className="xs muted" style={{ marginBottom: 12 }}>{t(`rules.${g.key}.help`)}</p>
            <table className="table">
              <tbody>
                {g.fields.map(([field, unit]) => {
                  const value = g.nested ? rules[g.key][field][g.nested] : rules[g.key][field];
                  return (
                    <tr key={field}>
                      <td className="small">{t(`rules.${g.key}.${field}`)}</td>
                      <td style={{ width: 110 }}>
                        <div className="row" style={{ '--gap': '4px', flexWrap: 'nowrap' }}>
                          <NumberInput className="tight" value={value} step={unit === '×' ? 0.05 : 1} onChange={(n) => set(g.key, field, g.nested, n)} aria-label={t(`rules.${g.key}.${field}`)} />
                          <span className="xs muted">{unit}</span>
                        </div>
                      </td>
                      {g.risk && (
                        <td style={{ width: 96 }}>
                          <select className="select input tight" value={rules[g.key][field].risk || 'low'} onChange={(e) => setRisk(g.key, field, e.target.value)} aria-label={t('est.risk')}>
                            {['low', 'medium', 'high'].map((r) => <option key={r} value={r}>{t(`level.${r}`)}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
