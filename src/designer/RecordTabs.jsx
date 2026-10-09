import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../store/store.js';
import { effectiveEstimate } from '../engine/versions.js';
import { quoteKindLabel, setQuoteStatus, versionKindLabel } from '../store/actions.js';
import { contractDocument, developerBriefDocument, estimateDocument, quoteDocument } from '../documents/templates.js';
import { downloadPdf, printDocument } from '../documents/export.js';
import { usePdfPreview } from '../components/PdfPreview.jsx';
import { Empty, Segmented, SourceTag, toast } from '../components/ui.jsx';

/** Designer + system events and the client's own session activity, one timeline. */
export function mergedActivity(p) {
  return [...p.activity, ...(p.clientSession?.activity || [])].sort((a, b) => b.at.localeCompare(a.at));
}

export function ActivityTab({ p }) {
  const { t, tl, dateTime } = useI18n();
  const [filter, setFilter] = useState('all');
  const items = useMemo(() => mergedActivity(p).filter((e) => filter === 'all' || e.actor === filter), [p, filter]);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <p className="small muted">{t('activity.hint')}</p>
        <Segmented
          label={t('activity.filter')}
          value={filter}
          onChange={setFilter}
          options={['all', 'client', 'system', 'designer'].map((x) => ({ value: x, label: t(`activity.f.${x}`) }))}
        />
      </div>
      {!items.length ? (
        <Empty title={t('activity.empty')} />
      ) : (
        <ol className="timeline panel" style={{ padding: '4px 20px' }}>
          {items.map((e) => (
            <li key={e.id}>
              <span className="t-time">{dateTime(e.at)}</span>
              <span><SourceTag source={e.actor} /></span>
              <span>{tl(e.text)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const QUOTE_STATUSES = ['draft', 'preliminary', 'underReview', 'revised', 'final', 'accepted', 'expired', 'cancelled'];

export function DocumentsTab({ p }) {
  const { t, tl, lang, date } = useI18n();
  const settings = useStore((s) => s.settings);
  const [busy, setBusy] = useState(null);
  const [openPreview, previewEl] = usePdfPreview();

  const run = async (key, doc) => {
    setBusy(key);
    try {
      await downloadPdf(doc);
    } catch (err) {
      console.error(err);
      toast(t('doc.pdfFailed'));
    } finally {
      setBusy(null);
    }
  };

  const docs = [];
  for (const v of p.estimates.filter((x) => x.locked)) {
    docs.push({
      key: v.id,
      at: v.lockedAt,
      type: t('docs.type.estimate'),
      name: `${t('docs.estimate')} v${v.number}`,
      status: tl(versionKindLabel(v.kind)),
      related: v.basedOn ? `${t('docs.from')} v${p.estimates.find((x) => x.id === v.basedOn)?.number}` : t('docs.fromClient'),
      build: () => estimateDocument({ project: p, version: v, eff: effectiveEstimate(v), settings, lang }),
      internal: true,
    });
  }
  for (const q of p.quotes) {
    docs.push({
      key: q.id,
      at: q.createdAt,
      type: tl(quoteKindLabel(q.kind)),
      name: `${t('docs.quote')} Q${q.number}`,
      quote: q,
      related: `${t('docs.estimate')} v${q.estimateNumber}`,
      build: () => quoteDocument(q, lang),
    });
    if (q.engineering === 'needDev') {
      const v = p.estimates.find((x) => x.id === q.estimateId);
      if (v) {
        docs.push({
          key: `${q.id}-brief`,
          at: q.createdAt,
          type: t('docs.type.brief'),
          name: `${t('docs.brief')} · Q${q.number}`,
          status: '—',
          related: `${t('docs.quote')} Q${q.number}`,
          build: () => developerBriefDocument({ project: p, quote: q, version: v, settings, lang }),
        });
      }
    }
  }
  for (const c of p.contracts) {
    const q = p.quotes.find((x) => x.id === c.quoteId);
    docs.push({
      key: c.id,
      at: c.lockedAt || c.createdAt,
      type: t('docs.type.contract'),
      name: `${t('docs.contract')} C${c.number}`,
      status: t(`contract.status.${c.status}`),
      related: `${t('docs.finalQuote')} Q${c.quoteNumber}`,
      build: () => contractDocument(c, q, settings, c.lang),
    });
  }
  docs.sort((a, b) => a.at.localeCompare(b.at));

  if (!docs.length) return <Empty title={t('docs.emptyTitle')}>{t('docs.emptyBody')}</Empty>;

  return (
    <>
    {previewEl}
    <div className="panel flush table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('docs.document')}</th>
            <th>{t('docs.typeCol')}</th>
            <th>{t('docs.status')}</th>
            <th>{t('docs.created')}</th>
            <th>{t('docs.related')}</th>
            <th className="r">{t('docs.download')}</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.key}>
              <td style={{ fontFamily: 'var(--serif)', fontSize: 'var(--fs-md)' }}>
                {d.name}
                {d.internal && <div className="xs muted">{t('docs.internal')}</div>}
              </td>
              <td>{d.type}</td>
              <td>
                {d.quote ? (
                  <select className="select input tight" style={{ width: 140 }} value={d.quote.status} onChange={(e) => setQuoteStatus(p.id, d.quote.id, e.target.value)} aria-label={t('docs.status')}>
                    {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(`quoteStatus.${s}`)}</option>)}
                  </select>
                ) : (
                  d.status
                )}
              </td>
              <td className="num">{date(d.at)}</td>
              <td className="small muted">{d.related}</td>
              <td className="r nowrap">
                <button className="btn small ghost" onClick={() => openPreview(d.build)}>{t('doc.preview')}</button>{' '}
                <button className="btn small" disabled={busy === d.key} onClick={() => run(d.key, d.build())}>{busy === d.key ? t('doc.preparing') : 'PDF'}</button>{' '}
                <button className="btn small ghost" onClick={() => printDocument(d.build())}>{t('doc.printShort')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
