// Entry point for the public client site (the questionnaire only).
// It contains no designer workspace: nothing here reads or shows your projects.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useRoute, match } from './lib/router.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import { LangSwitch, Toaster } from './components/ui.jsx';
import ClientApp from './client/ClientApp.jsx';
import './styles.css';

function NoLink() {
  const { t } = useI18n();
  return (
    <div className="client-page">
      <div className="client-top">
        <span />
        <LangSwitch />
      </div>
      <div className="client-body">
        <h1 className="q-title">{t('clientSite.title')}</h1>
        <p className="q-hint">{t('clientSite.body')}</p>
      </div>
    </div>
  );
}

function ClientSite() {
  const route = useRoute();
  const quote = match('/quote/:token', route.path);
  return (
    <I18nProvider>
      {quote ? <ClientApp token={quote.token} query={route.query} /> : <NoLink />}
      <Toaster />
    </I18nProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClientSite />
  </StrictMode>,
);
