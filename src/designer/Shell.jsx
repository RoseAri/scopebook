import { useEffect } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Link, match } from '../lib/router.jsx';
import { useStore } from '../store/store.js';
import { LangSwitch } from '../components/ui.jsx';
import ProjectsPage from './ProjectsPage.jsx';
import ProjectPage from './ProjectPage.jsx';
import BaselinePage from './BaselinePage.jsx';
import PricingPage from './PricingPage.jsx';
import TemplatesPage from './TemplatesPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import { BackupBanner } from './BackupControls.jsx';
import { initAutoBackup } from '../store/autobackup.js';

export default function DesignerShell({ route }) {
  const { t } = useI18n();
  const designer = useStore((s) => s.settings.designer);
  const path = route.path;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  useEffect(() => {
    initAutoBackup();
  }, []);

  const project = match('/projects/:id/:tab?', path);
  const nav = [
    { to: '/', label: t('nav.projects'), active: path === '/' || !!project },
    { to: '/baseline', label: t('nav.baseline'), active: path === '/baseline' },
    { to: '/pricing', label: t('nav.pricing'), active: path === '/pricing' },
    { to: '/contracts', label: t('nav.contracts'), active: path === '/contracts' },
    { to: '/settings', label: t('nav.settings'), active: path === '/settings' },
  ];

  let page;
  if (project) page = <ProjectPage id={project.id} tab={project.tab || 'overview'} />;
  else if (path === '/baseline') page = <BaselinePage />;
  else if (path === '/pricing') page = <PricingPage />;
  else if (path === '/contracts') page = <TemplatesPage />;
  else if (path === '/settings') page = <SettingsPage />;
  else page = <ProjectsPage />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          {designer.studio || 'Scopebook'}
          <small>{t('brand.tagline')}</small>
        </div>
        <nav aria-label={t('nav.label')}>
          {nav.map((n) => (
            <Link key={n.to} to={n.to} current={n.active}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          <LangSwitch />
        </div>
      </aside>
      <main className="main">
        <BackupBanner />
        {page}
      </main>
    </div>
  );
}
