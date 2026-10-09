// Client experience: a guided project conversation behind a private link.
// The invitation payload travels in the URL hash; answers stay in the client's
// browser until they send the return code to the designer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { I18nProvider, useI18n } from '../i18n/index.jsx';
import { decodeObject } from '../lib/codec.js';
import { storage } from '../store/storage.js';
import { SCREENS, SECTIONS } from '../data/questionnaire.js';
import { estimate, flowGoalsInScope } from '../engine/estimate.js';
import { inputsFromSession } from '../engine/versions.js';
import { unpackSnapshot } from '../engine/snapshot.js';
import * as S from './session.js';
import { LangSwitch, Progress } from '../components/ui.jsx';
import { QuestionScreen, ScopeScreen, LevelsScreen, FlowsScreen, ReferencesScreen, IntroScreen } from './ClientScreens.jsx';
import { ResultScreen, EstimateDrawer } from './ClientResult.jsx';

/** The designer's own browser holds the project: show a way back to the workspace. */
function designerProjectHere(token) {
  const ws = storage.loadWorkspace();
  return (ws && Object.values(ws.projects || {}).find((x) => x.access?.token === token)) || null;
}

function isRevokedHere(token) {
  // If this browser also holds the designer workspace, honour a revoked link immediately.
  const ws = storage.loadWorkspace();
  const p = ws && Object.values(ws.projects || {}).find((x) => x.access?.token === token);
  return p ? !p.access.active : false;
}

export default function ClientApp({ token, query }) {
  const { t } = useI18n();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = storage.loadClientSession(token);
        let payload = null;
        const d = query.get('d');
        if (d) {
          payload = await decodeObject(d);
          payload.snapshot = unpackSnapshot(payload.snapshot);
        }
        if (!payload && saved) {
          payload = { token, projectId: saved.projectId, projectName: saved.projectName, snapshot: saved.snapshotUsed, designer: saved.designer || {}, createdAt: saved.inviteCreatedAt };
        }
        if (!payload || payload.token !== token || !payload.snapshot) throw new Error('invalid');
        if (isRevokedHere(token)) throw new Error('revoked');
        if (payload.expiresAt && new Date(payload.expiresAt) < new Date() && !saved?.submittedAt) throw new Error('expired');
        if (cancelled) return;
        setInvite(payload);
        const s = saved && saved.projectId === payload.projectId ? saved : { ...S.newSession(payload), designer: payload.designer };
        setSession(s);
        storage.saveClientSession(token, s);
      } catch (err) {
        if (!cancelled) setError(['revoked', 'expired'].includes(err.message) ? err.message : 'invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, query]);

  const update = useCallback(
    (fn) => {
      setSession((s) => {
        const next = fn(s);
        if (next !== s) storage.saveClientSession(token, next);
        return next;
      });
    },
    [token],
  );

  if (error) return <ClientMessage kind={error} />;
  if (!invite || !session) return <div className="client-page"><div className="client-body muted">{t('common.loading')}</div></div>;
  return (
    <I18nProvider currencySymbol={invite.snapshot.pricing.currencySymbol || 'NT$'}>
      <ClientFlow invite={invite} session={session} update={update} preview={query.get('preview') === '1'} />
    </I18nProvider>
  );
}

function ClientMessage({ kind }) {
  const { t } = useI18n();
  return (
    <div className="client-page">
      <div className="client-top">
        <span />
        <LangSwitch />
      </div>
      <div className="client-body">
        <h1 className="q-title">{t(`client.error.${kind}.title`)}</h1>
        <p className="q-hint">{t(`client.error.${kind}.body`)}</p>
      </div>
    </div>
  );
}

function ClientFlow({ invite, session, update, preview }) {
  const { t, tl } = useI18n();
  // The preview notice appears only when the designer opened "Preview as client" from their own
  // workspace. A client using the normal link, even on the designer's computer, never sees it.
  const designerProject = useMemo(() => (preview ? designerProjectHere(invite.token) : null), [preview, invite.token]);
  const [drawer, setDrawer] = useState(false);
  const snapshot = invite.snapshot;
  const fnDefs = useMemo(() => Object.fromEntries(snapshot.functions.map((f) => [f.id, f])), [snapshot]);
  const inputs = useMemo(() => inputsFromSession(session), [session]);
  const result = useMemo(() => estimate(inputs, snapshot), [inputs, snapshot]);
  const flowGoals = useMemo(() => flowGoalsInScope(inputs.functions, fnDefs, inputs.goals), [inputs, fnDefs]);

  const order = useMemo(() => ['intro', ...SCREENS.filter((s) => s.id !== 'flows' || flowGoals.length).map((s) => s.id), 'result'], [flowGoals.length]);
  const current = order.includes(session.screen) ? session.screen : 'intro';
  const index = order.indexOf(current);
  const screenDef = SCREENS.find((s) => s.id === current);
  const keptCount = inputs.functions.length;

  // Suggest the standard scope as soon as the client reaches it.
  useEffect(() => {
    if (current === 'scope') update((s) => S.ensureScope(s, snapshot.functions));
  }, [current, update, snapshot.functions]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current]);

  const go = (id) => update((s) => S.markScreen(s, id));
  const next = () => go(order[Math.min(order.length - 1, index + 1)]);
  const back = () => go(order[Math.max(0, index - 1)]);

  const openEstimate = () => {
    setDrawer(true);
    update((s) => S.noteEstimateView(s));
  };

  const sectionIndex = screenDef ? SECTIONS.findIndex((x) => x.id === screenDef.section) : current === 'result' ? SECTIONS.length : -1;
  const studio = invite.designer?.studio;

  return (
    <div className="client-page">
      {designerProject && (
        <div className="preview-bar" role="note">
          <span>{t('preview.bar')}</span>
          <a href={`#/projects/${designerProject.id}`}>{t('preview.back')}</a>
        </div>
      )}
      <header className="client-top">
        <div className="studio">
          {studio || t('client.privateProject')}
          <small>{invite.projectName}</small>
        </div>
        <div className="row" style={{ '--gap': '12px' }}>
          {keptCount > 0 && current !== 'result' && current !== 'intro' && (
            <button className="btn small" onClick={openEstimate}>{t('client.seeEstimate')}</button>
          )}
          <LangSwitch />
        </div>
      </header>

      {current !== 'intro' && (
        <div className="client-progress" aria-label={t('client.progress')}>
          <Progress value={session.completion} />
          <div className="sections">
            {SECTIONS.map((sec, i) => (
              <span key={sec.id} className={i < sectionIndex ? 'done' : i === sectionIndex ? 'current' : ''}>
                {tl(sec.label)}
              </span>
            ))}
          </div>
        </div>
      )}

      <main className={`client-body${current === 'result' ? ' wide' : ''}`}>
        {current === 'intro' && <IntroScreen invite={invite} session={session} onStart={next} />}
        {screenDef?.questions && (
          <QuestionScreen key={current} screen={screenDef} session={session} update={update} inputs={inputs} snapshot={snapshot} onFinish={() => go('result')} />
        )}
        {current === 'scope' && <ScopeScreen session={session} update={update} snapshot={snapshot} fnDefs={fnDefs} />}
        {current === 'levels' && <LevelsScreen session={session} update={update} fnDefs={fnDefs} />}
        {current === 'flows' && <FlowsScreen session={session} update={update} flowGoals={flowGoals} />}
        {current === 'references' && <ReferencesScreen session={session} update={update} />}
        {current === 'result' && <ResultScreen designerProject={designerProject} invite={invite} session={session} update={update} inputs={inputs} result={result} onBack={back} onEdit={(id) => go(id)} />}
      </main>

      {current !== 'intro' && current !== 'result' && (
        <nav className="client-nav" aria-label={t('client.navigation')}>
          <div className="client-nav-inner">
            <button className="btn ghost" onClick={back}>{t('common.back')}</button>
            <span className="grow xs muted" style={{ textAlign: 'center' }}>{t('client.savedLocally')}</span>
            <button className="btn primary large" onClick={next} disabled={current === 'scope' && keptCount === 0 && !session.scope.custom.length}>
              {order[index + 1] === 'result' ? t('client.seeResult') : t('common.continue')}
            </button>
          </div>
        </nav>
      )}

      {drawer && <EstimateDrawer result={result} onClose={() => setDrawer(false)} onFinish={() => { setDrawer(false); go('result'); }} />}
    </div>
  );
}
