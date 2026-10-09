// Estimate presentation shared by the client result page and the designer workspace.
import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Level } from './ui.jsx';
import { hoursRange } from '../lib/format.js';

const fmtH = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US');

/** "Why is this estimate 92–105h?" — every line traceable to a rule. */
export function EstimateLedger({ result, effort }) {
  const { t, tl } = useI18n();
  const [open, setOpen] = useState({});
  const eff = effort || result.effort;
  return (
    <div>
      <p className="sub-title" style={{ marginBottom: 6 }}>{t('est.why', { range: hoursRange(eff) })}</p>
      <div className="ledger">
        {result.lines.map((line) => (
          <div key={line.id}>
            <div className="ledger-row">
              <span className="l-label">
                {line.detail?.length ? (
                  <button className="ledger-toggle" aria-expanded={!!open[line.id]} onClick={() => setOpen((o) => ({ ...o, [line.id]: !o[line.id] }))}>
                    <span className="chev">▶</span>
                    <span>{tl(line.label)}</span>
                  </button>
                ) : (
                  <span style={{ paddingLeft: line.detail ? 17 : 0 }}>{tl(line.label)}</span>
                )}
                {line.note && <span className="l-note" style={{ paddingLeft: line.detail?.length ? 17 : 0 }}>{tl(line.note)}</span>}
              </span>
              <span className="l-leader" />
              <span className="l-value num">{line.id === 'overhead' || line.id === 'base' ? '' : '+'}{fmtH(line.hours)}h</span>
            </div>
            {open[line.id] && line.detail?.length > 0 && (
              <div className="ledger-detail">
                {line.detail.map((d, i) => (
                  <div className="ledger-row" key={i}>
                    <span className="l-label">{tl(d.label)}</span>
                    <span className="l-leader" />
                    <span className="l-value num">{d.hours != null ? `${fmtH(d.hours)}h` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="ledger-row total">
          <span className="l-label">
            {t('est.point')}
            <span className="l-note">{t('est.rangeNote', { level: t(`level.${result.confidence.level}`) })}</span>
          </span>
          <span className="l-leader" />
          <span className="l-value num">{result.effort.point}h</span>
        </div>
      </div>
    </div>
  );
}

export function PriceLedger({ price, effort }) {
  const { t, tl, money, moneyRange } = useI18n();
  return (
    <div className="ledger">
      <div className="ledger-row">
        <span className="l-label">
          {t('price.base')}
          <span className="l-note">{t('price.baseNote', { range: hoursRange(effort), rate: money(price.rate) })}</span>
        </span>
        <span className="l-leader" />
        <span className="l-value num">{moneyRange(price.base)}</span>
      </div>
      {price.adjustments.map((a) => (
        <div className="ledger-row" key={a.id}>
          <span className="l-label">
            {tl(a.name)}
            <span className="l-note">{a.kind === 'percent' ? `${a.value}%` : t('price.fixedAmount')} · {a.source === 'manual' ? t('source.designer') : t('price.rule')}</span>
          </span>
          <span className="l-leader" />
          <span className="l-value num">+{moneyRange(a.amount)}</span>
        </div>
      ))}
      {price.minimumApplied && (
        <div className="ledger-row">
          <span className="l-label">{t('price.minimumApplied')}</span>
          <span className="l-leader" />
          <span className="l-value" />
        </div>
      )}
      <div className="ledger-row total">
        <span className="l-label">{price.overridden ? t('price.totalOverridden') : t('price.total')}</span>
        <span className="l-leader" />
        <span className="l-value num">{moneyRange(price.total)}</span>
      </div>
    </div>
  );
}

export function Figures({ effort, price, confidence, fixedPrice, compact }) {
  const { t, money, moneyRange } = useI18n();
  return (
    <div className="figures" style={compact ? { marginTop: 12 } : undefined}>
      <div>
        <div className="figure-label">{t('est.effort')}</div>
        <div className={`figure ${compact ? 'md' : 'lg'} num`}>
          {effort.min === effort.max ? effort.min : `${effort.min}–${effort.max}`}
          <span className="unit">{t('common.hours')}</span>
        </div>
      </div>
      <div>
        <div className="figure-label">{fixedPrice != null ? t('est.finalPrice') : t('est.priceRange')}</div>
        <div className={`figure ${compact ? 'md' : 'lg'} num`}>{fixedPrice != null ? money(fixedPrice) : price.min === price.max ? money(price.min) : (<><span className="nowrap">{money(price.min)}</span> <span className="nowrap">– {Math.round(price.max).toLocaleString('en-US')}</span></>)}</div>
      </div>
      <div>
        <div className="figure-label">{t('est.confidence')}</div>
        <div className={`figure ${compact ? 'md' : 'lg'}`}>{t(`level.${confidence}`)}</div>
      </div>
    </div>
  );
}

export function UnknownList({ unknowns, empty }) {
  const { t, tl } = useI18n();
  if (!unknowns.length) return <p className="muted small">{empty || t('est.noUnknowns')}</p>;
  return (
    <ul className="stack" style={{ '--gap': '6px', paddingLeft: 0, listStyle: 'none', margin: 0 }}>
      {unknowns.map((u) => (
        <li key={u.id} className="row" style={{ '--gap': '8px', alignItems: 'baseline', flexWrap: 'nowrap' }}>
          <span className={`dot ${u.impact === 'high' ? 'high' : 'medium'}`} style={{ transform: 'translateY(-1px)' }} />
          <span className="grow">{tl(u.text)}</span>
          <span className="xs faint nowrap">{u.impact === 'high' ? t('est.highImpact') : t('est.mediumImpact')}</span>
        </li>
      ))}
    </ul>
  );
}

export function SignalList({ signals }) {
  const { tl, t } = useI18n();
  if (!signals.length) return <p className="muted small">{t('est.noRiskSignals')}</p>;
  return (
    <ul className="stack" style={{ '--gap': '6px', paddingLeft: 0, listStyle: 'none', margin: 0 }}>
      {signals.map((s, i) => (
        <li key={s.id + i} className="row" style={{ '--gap': '8px', flexWrap: 'nowrap', alignItems: 'baseline' }}>
          <Level value={s.level} />
          <span className="grow small">{tl(s.text)}</span>
        </li>
      ))}
    </ul>
  );
}

export function BasisList({ result, answers }) {
  const { t, tl } = useI18n();
  const c = result.counts;
  const items = [
    t('basis.functions', { n: c.functions }),
    t('basis.flows', { n: c.flows }),
    t('basis.screens', { n: c.screens }),
    t('basis.states', { n: c.states }),
  ];
  if (c.roles > 1) items.push(t('basis.roles', { n: c.roles }));
  if (answers?.currentState && answers.currentState !== 'none') items.push(t(`basis.current.${answers.currentState}`));
  if (c.custom) items.push(t('basis.custom', { n: c.custom }));
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function ScheduleLine({ schedule }) {
  const { t } = useI18n();
  if (!schedule.pressure) return <span className="muted">{t('sched.unknown', { weeks: schedule.minWeeks })}</span>;
  return (
    <span>
      <Level value={schedule.pressure} />
      {schedule.weeks != null && (
        <span className="muted small" style={{ marginLeft: 10 }}>
          {t('sched.pace', { pace: schedule.pace, weeks: schedule.weeks, capacity: schedule.capacity })}
        </span>
      )}
    </span>
  );
}
