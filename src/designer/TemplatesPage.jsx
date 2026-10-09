import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { updateSettings } from '../store/actions.js';
import { CONTRACT_DISCLAIMER, CONTRACT_VARIABLES, IP_OPTIONS, PORTFOLIO_OPTIONS, starterTemplates } from '../data/contracts.js';
import { Confirm, Field, Segmented, Select, TextInput, toast } from '../components/ui.jsx';
import { clone, moveItem, uid } from '../lib/util.js';

export default function TemplatesPage() {
  const { t, tl, lang } = useI18n();
  const contracts = useStore((s) => s.settings.contracts);
  const [selected, setSelected] = useState(contracts.templates[0]?.id);
  const [editLang, setEditLang] = useState(lang);
  const [confirm, setConfirm] = useState(null);
  const tpl = contracts.templates.find((x) => x.id === selected) || contracts.templates[0];
  const idx = contracts.templates.findIndex((x) => x.id === tpl?.id);
  const upd = (fn) => updateSettings((s) => fn(s.contracts.templates[idx], s.contracts));

  const duplicate = () => {
    const copy = clone(tpl);
    copy.id = uid('tpl-');
    copy.starter = false;
    copy.name = { zh: `${tpl.name.zh}（我的版本）`, en: `${tpl.name.en} (my version)` };
    updateSettings((s) => { s.contracts.templates.unshift(copy); });
    setSelected(copy.id);
    toast(t('templates.duplicated'));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('templates.title')}</h1>
          <p className="lede">{t('templates.lede')}</p>
        </div>
      </div>
      <p className="warn-box" style={{ marginBottom: 24 }}>{tl(CONTRACT_DISCLAIMER)}</p>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head"><h2>{t('templates.defaults')}</h2></div>
        <div className="grid-3">
          <Field label={t('templates.defaultTemplate')}>
            <Select value={contracts.defaultTemplateId} onChange={(v) => updateSettings((s) => { s.contracts.defaultTemplateId = v; })} options={contracts.templates.map((x) => ({ value: x.id, label: tl(x.name) }))} />
          </Field>
          <Field label={t('contract.ip')}>
            <Select value={contracts.defaultIp} onChange={(v) => updateSettings((s) => { s.contracts.defaultIp = v; })} options={Object.entries(IP_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
          </Field>
          <Field label={t('contract.portfolio')}>
            <Select value={contracts.defaultPortfolio} onChange={(v) => updateSettings((s) => { s.contracts.defaultPortfolio = v; })} options={Object.entries(PORTFOLIO_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
          </Field>
        </div>
      </section>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)' }}>
        <aside className="stack" style={{ '--gap': '6px' }}>
          {contracts.templates.map((x) => (
            <button key={x.id} className={`choice${x.id === tpl?.id ? '' : ''}`} aria-pressed={x.id === tpl?.id} onClick={() => setSelected(x.id)} style={{ padding: '10px 12px' }}>
              <span>
                <span style={{ display: 'block', fontWeight: 500 }}>{tl(x.name)}</span>
                <span className="xs muted">{x.starter ? t('templates.starter') : t('templates.mine')} · {t('templates.sections', { n: x.sections.length })}</span>
              </span>
            </button>
          ))}
        </aside>

        {tpl && (
          <section className="stack" style={{ '--gap': '16px' }}>
            <div className="row between">
              <Segmented label={t('templates.editLanguage')} value={editLang} onChange={setEditLang} options={[{ value: 'zh', label: '繁中' }, { value: 'en', label: 'EN' }]} />
              <div className="row" style={{ '--gap': '8px' }}>
                <button className="btn" onClick={duplicate}>{t('templates.duplicate')}</button>
                {tpl.starter ? (
                  <button className="btn ghost" onClick={() => setConfirm('reset')}>{t('templates.reset')}</button>
                ) : (
                  <button className="btn danger" onClick={() => setConfirm('delete')}>{t('common.delete')}</button>
                )}
              </div>
            </div>
            {tpl.starter && <p className="note-box">{t('templates.starterNote')}</p>}
            <div className="grid-2">
              <Field label={t('templates.name')}><TextInput value={tpl.name[editLang]} onChange={(v) => upd((x) => { x.name[editLang] = v; })} /></Field>
              <Field label={t('templates.description')}><TextInput value={tpl.description?.[editLang] || ''} onChange={(v) => upd((x) => { x.description = { ...(x.description || {}), [editLang]: v }; })} /></Field>
            </div>
            <div className="grid-3">
              <Field label={t('contract.ip')}>
                <Select value={tpl.defaults?.ip} onChange={(v) => upd((x) => { x.defaults = { ...(x.defaults || {}), ip: v }; })} options={Object.entries(IP_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
              </Field>
              <Field label={t('contract.portfolio')}>
                <Select value={tpl.defaults?.portfolio} onChange={(v) => upd((x) => { x.defaults = { ...(x.defaults || {}), portfolio: v }; })} options={Object.entries(PORTFOLIO_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
              </Field>
              <Field label={t('contract.confidentiality')}>
                <label className="check" style={{ minHeight: 38 }}>
                  <input type="checkbox" checked={!!tpl.defaults?.confidentiality} onChange={(e) => upd((x) => { x.defaults = { ...(x.defaults || {}), confidentiality: e.target.checked }; })} />
                  {t('contract.includeConfidentiality')}
                </label>
              </Field>
            </div>

            {tpl.sections.map((s, i) => (
              <div key={s.key + i} className="contract-section">
                <div className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
                  <span className="muted small" style={{ width: 22 }}>{i + 1}</span>
                  <input className="title-input grow" value={s.title[editLang]} onChange={(e) => upd((x) => { x.sections[i].title[editLang] = e.target.value; })} aria-label={t('contract.sectionTitle')} />
                  {s.auto && <span className="tag plain" title={t('templates.autoHelp')}>{t('templates.auto')}</span>}
                  <label className="check xs">
                    <input type="checkbox" checked={s.enabled !== false} onChange={(e) => upd((x) => { x.sections[i].enabled = e.target.checked; })} />
                    {t('templates.enabled')}
                  </label>
                  <button className="btn small ghost" disabled={i === 0} onClick={() => upd((x) => { x.sections = moveItem(x.sections, i, -1); })} aria-label={t('common.moveUp')}>↑</button>
                  <button className="btn small ghost" disabled={i === tpl.sections.length - 1} onClick={() => upd((x) => { x.sections = moveItem(x.sections, i, 1); })} aria-label={t('common.moveDown')}>↓</button>
                  <button className="btn small ghost" onClick={() => upd((x) => { x.sections.splice(i, 1); })} aria-label={t('common.delete')}>×</button>
                </div>
                <textarea className="textarea" style={{ marginTop: 8 }} rows={Math.min(10, Math.max(3, (s.body[editLang] || '').split('\n').length + 1))} value={s.body[editLang]} onChange={(e) => upd((x) => { x.sections[i].body[editLang] = e.target.value; })} aria-label={s.title[editLang]} />
              </div>
            ))}
            <div>
              <button className="btn" onClick={() => upd((x) => { x.sections.push({ key: `custom-${uid()}`, title: { zh: '新條款', en: 'New clause' }, body: { zh: '', en: '' }, enabled: true, optional: true }); })}>{t('contract.addSection')}</button>
            </div>
            <section className="panel">
              <div className="panel-head"><h2>{t('templates.variables')}</h2></div>
              <p className="xs muted" style={{ marginBottom: 8 }}>{t('templates.variablesHelp')}</p>
              <div className="row" style={{ '--gap': '6px' }}>
                {CONTRACT_VARIABLES.map((v) => <code key={v} className="tag plain">{`{{${v}}}`}</code>)}
              </div>
            </section>
          </section>
        )}
      </div>

      {confirm && (
        <Confirm
          title={confirm === 'delete' ? t('templates.deleteTitle') : t('templates.reset')}
          message={confirm === 'delete' ? t('templates.deleteBody') : t('templates.resetBody')}
          confirmLabel={confirm === 'delete' ? t('common.delete') : t('templates.reset')}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'delete') {
              updateSettings((s) => { s.contracts.templates = s.contracts.templates.filter((x) => x.id !== tpl.id); });
              setSelected(null);
            } else {
              const fresh = starterTemplates().find((x) => x.id === tpl.id);
              if (fresh) updateSettings((s) => { s.contracts.templates[idx] = fresh; });
            }
          }}
        />
      )}
    </div>
  );
}
