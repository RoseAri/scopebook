import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { updateSettings } from '../store/actions.js';
import { ADJUSTMENT_TRIGGERS } from '../data/pricing.js';
import { Field, NumberInput, TextInput } from '../components/ui.jsx';
import { uid } from '../lib/util.js';

export default function PricingPage() {
  const { t, tl, money } = useI18n();
  const pricing = useStore((s) => s.settings.pricing);
  const set = (fn) => updateSettings((s) => fn(s.pricing));
  const scheduleTotal = pricing.paymentSchedule.reduce((n, x) => n + Number(x.percent || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('pricing.title')}</h1>
          <p className="lede">{t('pricing.lede')}</p>
        </div>
      </div>

      <div className="stack" style={{ '--gap': '24px' }}>
        <section className="panel">
          <div className="panel-head"><h2>{t('pricing.basics')}</h2></div>
          <div className="grid-3">
            <Field label={t('pricing.rate')} help={t('pricing.rateHelp')}><NumberInput value={pricing.hourlyRate} onChange={(n) => set((p) => { p.hourlyRate = n ?? 0; })} /></Field>
            <Field label={t('pricing.minimum')}><NumberInput value={pricing.minimumFee} onChange={(n) => set((p) => { p.minimumFee = n ?? 0; })} /></Field>
            <Field label={t('pricing.rounding')}><NumberInput value={pricing.rounding} onChange={(n) => set((p) => { p.rounding = n || 1; })} /></Field>
            <Field label={t('pricing.capacity')} help={t('pricing.capacityHelp')}><NumberInput value={pricing.weeklyCapacity} onChange={(n) => set((p) => { p.weeklyCapacity = n || 1; })} /></Field>
            <Field label={t('pricing.currency')}><TextInput value={pricing.currency} onChange={(v) => set((p) => { p.currency = v; })} /></Field>
            <Field label={t('pricing.symbol')}><TextInput value={pricing.currencySymbol} onChange={(v) => set((p) => { p.currencySymbol = v; })} /></Field>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>{t('pricing.example', { h: 80, price: money(80 * pricing.hourlyRate) })}</p>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('pricing.spreads')}</h2></div>
          <p className="xs muted" style={{ marginBottom: 12 }}>{t('pricing.spreadsHelp')}</p>
          <table className="table">
            <thead><tr><th>{t('est.confidence')}</th><th className="r">{t('pricing.below')}</th><th className="r">{t('pricing.above')}</th></tr></thead>
            <tbody>
              {['high', 'medium', 'low'].map((lv) => (
                <tr key={lv}>
                  <td>{t(`level.${lv}`)}</td>
                  <td className="r" style={{ width: 130 }}><NumberInput className="tight" value={pricing.spreads[lv][0]} onChange={(n) => set((p) => { p.spreads[lv][0] = n ?? 0; })} aria-label={t('pricing.below')} /></td>
                  <td className="r" style={{ width: 130 }}><NumberInput className="tight" value={pricing.spreads[lv][1]} onChange={(n) => set((p) => { p.spreads[lv][1] = n ?? 0; })} aria-label={t('pricing.above')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('pricing.adjustments')}</h2></div>
          <p className="xs muted" style={{ marginBottom: 12 }}>{t('pricing.adjustmentsHelp')}</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('pricing.on')}</th><th>{t('pricing.nameZh')}</th><th>{t('pricing.nameEn')}</th><th>{t('pricing.when')}</th><th className="r">{t('pricing.amount')}</th><th /></tr></thead>
              <tbody>
                {pricing.adjustments.map((a, i) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={a.enabled} onChange={(e) => set((p) => { p.adjustments[i].enabled = e.target.checked; })} aria-label={t('pricing.on')} /></td>
                    <td><input className="input tight" value={a.name.zh} onChange={(e) => set((p) => { p.adjustments[i].name.zh = e.target.value; })} /></td>
                    <td><input className="input tight" value={a.name.en} onChange={(e) => set((p) => { p.adjustments[i].name.en = e.target.value; })} /></td>
                    <td>
                      <select className="select input tight" value={a.trigger} onChange={(e) => set((p) => { p.adjustments[i].trigger = e.target.value; })}>
                        {ADJUSTMENT_TRIGGERS.filter((x) => x.id !== 'manual').map((x) => <option key={x.id} value={x.id}>{tl(x.label)}</option>)}
                      </select>
                    </td>
                    <td className="r">
                      <div className="row" style={{ '--gap': '4px', flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        <input className="input tight num" style={{ width: 90 }} type="number" value={a.value} onChange={(e) => set((p) => { p.adjustments[i].value = Number(e.target.value); })} />
                        <select className="select input tight" style={{ width: 80 }} value={a.kind} onChange={(e) => set((p) => { p.adjustments[i].kind = e.target.value; })}>
                          <option value="percent">%</option>
                          <option value="fixed">{pricing.currencySymbol}</option>
                        </select>
                      </div>
                    </td>
                    <td className="r"><button className="btn small ghost" onClick={() => set((p) => { p.adjustments.splice(i, 1); })}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn small" style={{ marginTop: 10 }} onClick={() => set((p) => { p.adjustments.push({ id: uid('adj'), name: { zh: '新規則', en: 'New rule' }, kind: 'percent', value: 5, trigger: 'always', enabled: false }); })}>{t('pricing.addRule')}</button>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('pricing.quoteDefaults')}</h2></div>
          <div className="grid-3">
            <Field label={t('pricing.revisionRounds')}><NumberInput value={pricing.revisionRounds} onChange={(n) => set((p) => { p.revisionRounds = n ?? 0; })} /></Field>
            <Field label={t('pricing.validity')}><NumberInput value={pricing.quoteValidityDays} onChange={(n) => set((p) => { p.quoteValidityDays = n ?? 30; })} /></Field>
            <Field label={t('pricing.dueDays')}><NumberInput value={pricing.paymentDueDays} onChange={(n) => set((p) => { p.paymentDueDays = n ?? 7; })} /></Field>
          </div>
          <div className="sub-title" style={{ margin: '20px 0 8px' }}>{t('pricing.schedule')}</div>
          {pricing.paymentSchedule.map((s, i) => (
            <div key={s.id} className="row" style={{ '--gap': '8px', marginBottom: 6, flexWrap: 'nowrap' }}>
              <input className="input tight grow" value={s.label.zh} onChange={(e) => set((p) => { p.paymentSchedule[i].label.zh = e.target.value; })} aria-label={t('pricing.nameZh')} />
              <input className="input tight grow" value={s.label.en} onChange={(e) => set((p) => { p.paymentSchedule[i].label.en = e.target.value; })} aria-label={t('pricing.nameEn')} />
              <input className="input tight num" style={{ width: 80, flex: 'none' }} type="number" value={s.percent} onChange={(e) => set((p) => { p.paymentSchedule[i].percent = Number(e.target.value); })} />
              <span className="muted">%</span>
              <button className="btn small ghost" onClick={() => set((p) => { p.paymentSchedule.splice(i, 1); })}>×</button>
            </div>
          ))}
          <div className="row between">
            <button className="btn small" onClick={() => set((p) => { p.paymentSchedule.push({ id: uid('p'), label: { zh: '', en: '' }, percent: 0 }); })}>{t('pricing.addInstalment')}</button>
            <span className="small" style={scheduleTotal !== 100 ? { color: 'var(--brick)' } : { color: 'var(--muted)' }}>{t('pricing.total', { n: scheduleTotal })}</span>
          </div>

          <div className="sub-title" style={{ margin: '24px 0 8px' }}>{t('pricing.exclusions')}</div>
          {pricing.defaultExclusions.map((x, i) => (
            <div key={i} className="row" style={{ '--gap': '8px', marginBottom: 6, flexWrap: 'nowrap' }}>
              <input className="input tight grow" value={x.zh} onChange={(e) => set((p) => { p.defaultExclusions[i].zh = e.target.value; })} aria-label={t('pricing.nameZh')} />
              <input className="input tight grow" value={x.en} onChange={(e) => set((p) => { p.defaultExclusions[i].en = e.target.value; })} aria-label={t('pricing.nameEn')} />
              <button className="btn small ghost" onClick={() => set((p) => { p.defaultExclusions.splice(i, 1); })}>×</button>
            </div>
          ))}
          <button className="btn small" onClick={() => set((p) => { p.defaultExclusions.push({ zh: '', en: '' }); })}>{t('pricing.addExclusion')}</button>
        </section>
        <p className="xs muted">{t('pricing.versionsNote')}</p>
      </div>
    </div>
  );
}
