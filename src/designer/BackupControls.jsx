// Automatic backup: status banner, settings panel, restore-from-folder button.
import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { replaceState, useStore } from '../store/store.js';
import { backUpToFolder, connectFolder, readFromFolder, resumeBackup, stopBackup, supported, useAutoBackup } from '../store/autobackup.js';
import { Link } from '../lib/router.jsx';
import { Confirm, toast } from '../components/ui.jsx';

const cancelled = (err) => err?.name === 'AbortError';

/** Shown across the workspace whenever the backup needs the designer's attention. */
export function BackupBanner() {
  const { t } = useI18n();
  const b = useAutoBackup();
  const hasProjects = useStore((s) => Object.keys(s.projects).length > 0);
  if (b.state === 'needsPermission') {
    return (
      <div className="warn-box row between" style={{ marginBottom: 24 }} role="status">
        <span>{t('backup.paused', { folder: b.folderName })}</span>
        <button className="btn small primary" onClick={() => resumeBackup().catch(() => {})}>{t('backup.resume')}</button>
      </div>
    );
  }
  if (b.state === 'error') {
    return (
      <div className="error-box row between" style={{ marginBottom: 24 }} role="alert">
        <span>{t('backup.failed')}</span>
        <Link to="/settings" className="btn small">{t('backup.openSettings')}</Link>
      </div>
    );
  }
  if (b.state === 'off' && hasProjects) {
    return (
      <div className="warn-box row between" style={{ marginBottom: 24 }} role="status">
        <span>{t('backup.offReminder')}</span>
        <Link to="/settings" className="btn small">{t('backup.turnOn')}</Link>
      </div>
    );
  }
  if (b.state === 'unsupported' && hasProjects) {
    return (
      <div className="note-box" style={{ marginBottom: 24 }} role="status">
        {t('backup.unsupportedReminder')} <Link to="/settings">{t('backup.openSettings')}</Link>
      </div>
    );
  }
  return null;
}

export function RestoreFromFolderButton({ className = 'btn' }) {
  const { t } = useI18n();
  const [found, setFound] = useState(null);
  if (!supported) return null;
  const pick = async () => {
    try {
      setFound(await readFromFolder());
    } catch (err) {
      if (cancelled(err)) return;
      toast(err.message === 'notFound' ? t('backup.notFound') : t('settings.restoreInvalid'));
    }
  };
  return (
    <>
      <button className={className} onClick={pick}>{t('backup.restoreFromFolder')}</button>
      {found && (
        <Confirm
          title={t('backup.restoreFromFolder')}
          message={t('backup.restoreBody', { n: Object.keys(found.data.projects).length, folder: found.handle.name })}
          confirmLabel={t('settings.restore')}
          danger
          onClose={() => setFound(null)}
          onConfirm={() => {
            replaceState(found.data);
            backUpToFolder(found.handle).catch(() => {});
            toast(t('settings.restored'));
          }}
        />
      )}
    </>
  );
}

export function AutoBackupPanel() {
  const { t, dateTime } = useI18n();
  const b = useAutoBackup();
  const run = (fn) => () => fn().catch((err) => !cancelled(err) && toast(t('backup.failed')));

  if (!supported) {
    return (
      <div className="stack" style={{ '--gap': '6px' }}>
        <div className="sub-title">{t('backup.title')}</div>
        <p className="small warn-box">{t('backup.unsupported')}</p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="row between">
        <div className="sub-title">{t('backup.title')}</div>
        <span className="dotline small">
          <span className={`dot ${b.state === 'on' ? 'low' : b.state === 'off' ? '' : 'high'}`} />
          {t(`backup.state.${b.state}`)}
        </span>
      </div>
      <p className="small muted">{t('backup.help')}</p>
      {b.state === 'on' && (
        <table className="table">
          <tbody>
            <tr><td className="muted">{t('backup.folder')}</td><td className="r">{b.folderName}</td></tr>
            <tr><td className="muted">{t('backup.lastSaved')}</td><td className="r">{b.lastSavedAt ? dateTime(b.lastSavedAt) : '—'}</td></tr>
            <tr><td className="muted">{t('backup.files')}</td><td className="r xs">scopebook-workspace.json<br />scopebook-backup-YYYY-MM-DD.json</td></tr>
          </tbody>
        </table>
      )}
      {b.error && <p className="error-box small">{b.error}</p>}
      <div className="row" style={{ '--gap': '8px' }}>
        {b.state === 'off' && <button className="btn primary" onClick={run(connectFolder)}>{t('backup.choose')}</button>}
        {b.state === 'needsPermission' && <button className="btn primary" onClick={run(resumeBackup)}>{t('backup.resume')}</button>}
        {(b.state === 'on' || b.state === 'error') && <button className="btn" onClick={run(connectFolder)}>{t('backup.change')}</button>}
        {b.state !== 'off' && b.state !== 'loading' && <button className="btn ghost" onClick={run(stopBackup)}>{t('backup.stop')}</button>}
        <RestoreFromFolderButton className="btn ghost" />
      </div>
    </div>
  );
}
