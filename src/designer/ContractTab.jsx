// Contract builder: generated from a Final Quote and a template, edited by the
// designer, versioned, and checked against the quote it came from.
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { CONTRACT_DISCLAIMER, IP_OPTIONS, PORTFOLIO_OPTIONS } from '../data/contracts.js';
import { contractText, contractVariables, generateContractSections } from '../engine/contract.js';
import { checkConsistency } from '../engine/versions.js';
import { createVersionFromLatest, generateContract, lockContract, newContractRevision, updateContract } from '../store/actions.js';
import { contractDocument } from '../documents/templates.js';
import { downloadPdf, printDocument } from '../documents/export.js';
import { usePdfPreview } from '../components/PdfPreview.jsx';
import { Link, navigate } from '../lib/router.jsx';
import { Confirm, Empty, Field, Modal, Select, TextInput, toast } from '../components/ui.jsx'; // eslint-disable-line no-unused-vars
import { moveItem, uid } from '../lib/util.js';

export default function ContractTab({ p }) {
  const { t } = useI18n();
  const finalQuotes = p.quotes.filter((q) => q.kind === 'final' && q.status !== 'cancelled');
  const [selectedId, setSelectedId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const contract = p.contracts.find((c) => c.id === selectedId) || p.contracts[p.contracts.length - 1];

  if (!finalQuotes.length && !p.contracts.length) {
    return (
      <ContractSteps p={p} />
    );
  }

  return (
    <div className="stack" style={{ '--gap': '24px' }}>
      <div className="row between">
        <div className="row" style={{ '--gap': '6px' }}>
          {p.contracts.map((c) => (
            <button key={c.id} className={`btn small${contract?.id === c.id ? ' primary' : ''}`} onClick={() => setSelectedId(c.id)}>
              C{c.number} · {t(`contract.status.${c.status}`)}
            </button>
          ))}
        </div>
        {finalQuotes.length > 0 && <button className="btn primary" onClick={() => setGenerating(true)}>{t('contract.generate')}</button>}
      </div>

      {!contract ? (
        <Empty title={t('contract.noneTitle')} action={<button className="btn primary" onClick={() => setGenerating(true)}>{t('contract.generate')}</button>}>
          {t('contract.noneBody')}
        </Empty>
      ) : (
        <ContractView key={contract.id} p={p} c={contract} onSelect={setSelectedId} />
      )}

      {generating && <GenerateModal p={p} quotes={finalQuotes} onClose={() => setGenerating(false)} onCreated={(id) => { setSelectedId(id); setGenerating(false); }} />}
    </div>
  );
}

/** What still has to happen before a contract can be generated, with the next action. */
function ContractSteps({ p }) {
  const { t } = useI18n();
  const latest = p.estimates[p.estimates.length - 1];
  const finalLocked = p.estimates.find((v) => v.kind === 'final' && v.locked);
  const draft = latest && !latest.locked ? latest : null;
  const steps = [
    {
      key: 'estimate',
      done: p.estimates.length > 0,
      action: !p.estimates.length ? <Link to={`/projects/${p.id}/estimates`} className="btn small">{t('contract.step.goEstimates')}</Link> : null,
    },
    {
      key: 'final',
      done: !!finalLocked,
      action: finalLocked || !p.estimates.length ? null : draft ? (
        <Link to={`/projects/${p.id}/estimates`} className="btn small primary">{t('contract.step.lockDraft', { n: draft.number })}</Link>
      ) : (
        <button className="btn small primary" onClick={() => { createVersionFromLatest(p.id, t('estimates.toFinalReason')); navigate(`/projects/${p.id}/estimates`); }}>{t('estimates.createFinalDraft')}</button>
      ),
    },
    {
      key: 'quote',
      done: false,
      action: finalLocked ? <Link to={`/projects/${p.id}/estimates`} className="btn small primary">{t('contract.step.makeQuote', { n: finalLocked.number })}</Link> : null,
    },
    { key: 'contract', done: false, action: null },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <div className="panel-head"><h2>{t('contract.needFinalTitle')}</h2></div>
      <p className="small muted" style={{ marginBottom: 18 }}>{t('contract.needFinalBody')}</p>
      <ol className="chain">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : i === current ? 'current' : ''}>
            <div className="row between" style={{ '--gap': '10px' }}>
              <div>
                <div className="c-title">{t(`contract.step.${s.key}`)}</div>
                <div className="c-meta">{t(`contract.step.${s.key}.help`)}</div>
              </div>
              {i === current && s.action}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GenerateModal({ p, quotes, onClose, onCreated }) {
  const { t, tl, lang } = useI18n();
  const contracts = useStore((s) => s.settings.contracts);
  const engineering = quotes[quotes.length - 1]?.engineering;
  const firstTemplate = contracts.templates.find((x) => x.id === (engineering === 'needDev' ? 'design-dev' : contracts.defaultTemplateId)) || contracts.templates[0];
  const [form, setForm] = useState({
    quoteId: quotes[quotes.length - 1].id,
    templateId: firstTemplate.id,
    lang,
    ip: firstTemplate.defaults?.ip || contracts.defaultIp,
    portfolio: firstTemplate.defaults?.portfolio || contracts.defaultPortfolio,
    confidentiality: firstTemplate.defaults?.confidentiality ?? true,
    party: { company: '', name: '' },
  });
  const partyOk = !!(form.party.company.trim() || form.party.name.trim());
  const set = (k) => (v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === 'templateId') {
      const tpl = contracts.templates.find((x) => x.id === v);
      if (tpl?.defaults) Object.assign(next, { ip: tpl.defaults.ip, portfolio: tpl.defaults.portfolio, confidentiality: tpl.defaults.confidentiality });
    }
    return next;
  });
  return (
    <Modal
      wide
      title={t('contract.generate')}
      description={tl(CONTRACT_DISCLAIMER)}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!partyOk} onClick={() => onCreated(generateContract(p.id, form.quoteId, form))}>{t('contract.generateAction')}</button>
        </>
      }
    >
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <Field label={t('contract.partyCompany')} help={t('contract.partyHelp')}>
          <TextInput value={form.party.company} onChange={(v) => setForm((f) => ({ ...f, party: { ...f.party, company: v } }))} />
        </Field>
        <Field label={t('contract.partyName')}>
          <TextInput value={form.party.name} onChange={(v) => setForm((f) => ({ ...f, party: { ...f.party, name: v } }))} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t('contract.fromQuote')}>
          <Select value={form.quoteId} onChange={set('quoteId')} options={quotes.map((q) => ({ value: q.id, label: `Q${q.number} · v${q.estimateNumber}` }))} />
        </Field>
        <Field label={t('contract.template')}>
          <Select value={form.templateId} onChange={set('templateId')} options={contracts.templates.map((x) => ({ value: x.id, label: tl(x.name) + (x.starter ? '' : ` · ${t('contract.mine')}`) }))} />
        </Field>
        <Field label={t('contract.language')}>
          <Select value={form.lang} onChange={set('lang')} options={[{ value: 'zh', label: '繁體中文' }, { value: 'en', label: 'English' }]} />
        </Field>
        <Field label={t('contract.ip')}>
          <Select value={form.ip} onChange={set('ip')} options={Object.entries(IP_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
        </Field>
        <Field label={t('contract.portfolio')}>
          <Select value={form.portfolio} onChange={set('portfolio')} options={Object.entries(PORTFOLIO_OPTIONS).map(([k, o]) => ({ value: k, label: tl(o.label) }))} />
        </Field>
        <Field label={t('contract.confidentiality')}>
          <label className="check" style={{ minHeight: 38 }}>
            <input type="checkbox" checked={form.confidentiality} onChange={(e) => set('confidentiality')(e.target.checked)} />
            {t('contract.includeConfidentiality')}
          </label>
        </Field>
      </div>
      <p className="xs muted" style={{ marginTop: 14 }}>{t('contract.inherits')}</p>
    </Modal>
  );
}

function ContractView({ p, c, onSelect }) {
  const { t, tl, date } = useI18n();
  const settings = useStore((s) => s.settings);
  const quote = p.quotes.find((q) => q.id === c.quoteId);
  const checks = useMemo(() => checkConsistency(contractText(c), c.facts), [c]);
  const mismatches = checks.filter((x) => !x.ok);
  const [confirm, setConfirm] = useState(null);
  const [vars, setVars] = useState(false);
  const draft = !c.locked;
  const upd = (fn) => updateContract(p.id, c.id, fn);
  const template = settings.contracts.templates.find((x) => x.id === c.templateId);

  const reinsert = (i) => {
    if (!template) return toast(t('contract.templateMissing'));
    const { sections } = generateContractSections({ template, quote, settings, lang: c.lang, ...c.options });
    const fresh = sections.find((s) => s.key === c.sections[i].key);
    if (!fresh) return toast(t('contract.noSourceSection'));
    upd((d) => { d.sections[i].body = fresh.body; d.sections[i].title = fresh.title; });
  };

  const [openPreview, previewEl] = usePdfPreview();
  const doc = () => contractDocument(c, quote, settings, c.lang);

  return (
    <div className="two-col">
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="row between top">
          <div>
            <p className="eyebrow">{t(`contract.status.${c.status}`)} · {tl(c.templateName)} · {c.lang === 'zh' ? '繁體中文' : 'English'}</p>
            <h2 className="page-title" style={{ fontSize: 'var(--fs-2xl)', marginTop: 4 }}>{t('contract.title', { n: c.number })}</h2>
            <p className="small muted">{t('contract.basedOnQuote', { q: c.quoteNumber, date: date(c.createdAt) })}{c.basedOn ? ` · ${t('contract.revisionOf', { n: p.contracts.find((x) => x.id === c.basedOn)?.number })}` : ''}</p>
          </div>
          <div className="row" style={{ '--gap': '8px' }}>
            <button className="btn" onClick={() => openPreview(doc)}>{t('doc.previewPdf')}</button>
            <button className="btn" onClick={() => downloadPdf(doc()).catch(() => toast(t('doc.pdfFailed')))}>{t('contract.downloadPdf')}</button>
            <button className="btn ghost" onClick={() => printDocument(doc())}>{t('doc.printShort')}</button>
          </div>
        </div>

        {mismatches.length > 0 ? (
          <div className="warn-box">
            <strong>⚠️ {t('contract.mismatch')}</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {mismatches.map((m) => (
                <li key={m.id}>{m.label}{t('common.colon')}{m.missing.join(t('common.listSep'))}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="note-box">{t('contract.consistent', { q: c.quoteNumber })}</div>
        )}

        {draft ? (
          <>
            <p className="xs muted">{tl(CONTRACT_DISCLAIMER)}</p>
            {c.sections.map((s, i) => (
              <div key={s.id} className="contract-section">
                <div className="row" style={{ '--gap': '6px', flexWrap: 'nowrap' }}>
                  <span className="muted small" style={{ width: 22 }}>{i + 1}</span>
                  <input className="title-input grow" value={s.title} onChange={(e) => upd((d) => { d.sections[i].title = e.target.value; })} aria-label={t('contract.sectionTitle')} />
                  {s.auto && <button className="btn small ghost" onClick={() => reinsert(i)} title={t('contract.reinsertHelp')}>{t('contract.reinsert')}</button>}
                  <button className="btn small ghost" disabled={i === 0} onClick={() => upd((d) => { d.sections = moveItem(d.sections, i, -1); })} aria-label={t('common.moveUp')}>↑</button>
                  <button className="btn small ghost" disabled={i === c.sections.length - 1} onClick={() => upd((d) => { d.sections = moveItem(d.sections, i, 1); })} aria-label={t('common.moveDown')}>↓</button>
                  <button className="btn small ghost" onClick={() => upd((d) => { d.sections.splice(i, 1); })} aria-label={t('common.delete')}>×</button>
                </div>
                <textarea className="textarea" style={{ marginTop: 8 }} value={s.body} rows={Math.min(14, Math.max(4, s.body.split('\n').length + 1))} onChange={(e) => upd((d) => { d.sections[i].body = e.target.value; })} aria-label={s.title} />
              </div>
            ))}
            <button className="btn" onClick={() => upd((d) => { d.sections.push({ id: uid('s'), key: 'custom', title: t('contract.newSection'), body: '', auto: false }); })}>{t('contract.addSection')}</button>
          </>
        ) : (
          <div className="panel contract-read">
            {c.sections.map((s, i) => (
              <div key={s.id}>
                <h3>{i + 1}. {s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="stack" style={{ '--gap': '24px', position: 'sticky', top: 24 }}>
        <section className="panel">
          <div className="panel-head"><h2>{t('contract.actions')}</h2></div>
          {draft ? (
            <div className="stack" style={{ '--gap': '10px' }}>
              <p className="small muted">{t('contract.draftHint')}</p>
              <button className="btn" onClick={() => setConfirm('revision')}>{t('contract.saveRevision')}</button>
              <button className="btn primary" onClick={() => setConfirm('final')}>{t('contract.saveFinal')}</button>
            </div>
          ) : (
            <div className="stack" style={{ '--gap': '10px' }}>
              <p className="small muted">{c.status === 'final' ? t('contract.finalHint', { date: date(c.lockedAt) }) : t('contract.lockedHint')}</p>
              <button className="btn" onClick={() => onSelect(newContractRevision(p.id, c.id))}>{t('contract.newRevision')}</button>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>{t('contract.checks')}</h2></div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '6px' }}>
            {checks.map((x) => (
              <li key={x.id} className="row small" style={{ '--gap': '8px', flexWrap: 'nowrap' }}>
                <span className={`dot ${x.ok ? 'low' : 'high'}`} />
                <span className="grow">{x.label}</span>
                <span className="xs muted">{x.ok ? t('contract.matches') : t('contract.differs')}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t('contract.variables')}</h2>
            <button className="btn-link xs" onClick={() => setVars((x) => !x)}>{vars ? t('common.hide') : t('common.show')}</button>
          </div>
          {vars && quote && (
            <table className="table">
              <tbody>
                {Object.entries(contractVariables({ quote, settings, lang: c.lang, ...c.options })).filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}><td className="xs muted">{`{{${k}}}`}</td><td className="xs pre">{String(v).slice(0, 160)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </aside>

      {previewEl}
      {confirm && (
        <Confirm
          title={confirm === 'final' ? t('contract.saveFinal') : t('contract.saveRevision')}
          message={confirm === 'final' ? (mismatches.length ? t('contract.finalWithMismatch') : t('contract.finalConfirm')) : t('contract.revisionConfirm')}
          confirmLabel={confirm === 'final' ? t('contract.saveFinal') : t('contract.saveRevision')}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            lockContract(p.id, c.id, confirm);
            if (confirm === 'revision') onSelect(newContractRevision(p.id, c.id));
          }}
        />
      )}
    </div>
  );
}

