import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { defaultSettings, getState, replaceState, useStore, SCHEMA } from '../store/store.js';
import { storage } from '../store/storage.js';
import { updateSettings } from '../store/actions.js';
import { Confirm, Field, LangSwitch, NumberInput, TextInput, toast } from '../components/ui.jsx';
import { downloadText } from '../lib/util.js';
import { AutoBackupPanel } from './BackupControls.jsx';

export default function SettingsPage() {
  const { t } = useI18n();
  const settings = useStore((s) => s.settings);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const d = settings.designer;
  const setD = (k) => (v) => updateSettings((s) => { s.designer[k] = v; });

  const backup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(JSON.stringify(getState(), null, 2), `scopebook-backup-${stamp}.json`, 'application/json');
  };

  const restore = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.schema !== SCHEMA || !data.settings || !data.projects) throw new Error('format');
      setConfirmRestore(data);
    } catch {
      toast(t('settings.restoreInvalid'));
    }
  };

  const kb = Math.round(storage.usageBytes() / 1024);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="lede">{t('settings.lede')}</p>
        </div>
      </div>
      <div className="stack" style={{ '--gap': '24px' }}>
        <section className="panel">
          <div className="panel-head"><h2>{t('settings.profile')}</h2></div>
          <p className="xs muted" style={{ marginBottom: 14 }}>{t('settings.profileHelp')}</p>
          <div className="grid-2">
            <Field label={t('settings.name')}><TextInput value={d.name} onChange={setD('name')} /></Field>
            <Field label={t('settings.studio')}><TextInput value={d.studio} onChange={setD('studio')} /></Field>
            <Field label={t('client.email')}><TextInput value={d.email} onChange={setD('email')} /></Field>
            <Field label={t('client.phone')}><TextInput value={d.phone} onChange={setD('phone')} /></Field>
            <Field label={t('settings.address')}><TextInput value={d.address} onChange={setD('address')} /></Field>
            <Field label={t('settings.taxId')}><TextInput value={d.taxId} onChange={setD('taxId')} /></Field>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('settings.links')}</h2></div>
          <div className="grid-2">
            <Field label={t('settings.appUrl')} help={t('settings.appUrlHelp')}>
              <TextInput value={settings.appUrl} onChange={(v) => updateSettings((s) => { s.appUrl = v.trim(); })} placeholder={`${window.location.origin}${window.location.pathname}`} />
            </Field>
            <Field label={t('settings.expiry')} help={t('settings.expiryHelp')}>
              <NumberInput value={settings.inviteExpiryDays} onChange={(n) => updateSettings((s) => { s.inviteExpiryDays = n ?? 0; })} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('settings.contractBasics')}</h2></div>
          <div className="grid-2">
            <Field label={t('settings.jurisdictionZh')}><TextInput value={settings.jurisdiction.zh} onChange={(v) => updateSettings((s) => { s.jurisdiction.zh = v; })} /></Field>
            <Field label={t('settings.jurisdictionEn')}><TextInput value={settings.jurisdiction.en} onChange={(v) => updateSettings((s) => { s.jurisdiction.en = v; })} /></Field>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('settings.language')}</h2><LangSwitch /></div>
          <p className="small muted">{t('settings.languageHelp')}</p>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('settings.data')}</h2><span className="xs muted">{t('settings.usage', { kb })}</span></div>
          <p className="small muted" style={{ marginBottom: 18 }}>{t('settings.dataHelp')}</p>
          <AutoBackupPanel />
          <hr className="hr" />
          <div className="sub-title" style={{ marginBottom: 10 }}>{t('backup.manual')}</div>
          <div className="row" style={{ '--gap': '8px' }}>
            <button className="btn" onClick={backup}>{t('settings.backup')}</button>
            <label className="btn">
              {t('settings.restore')}
              <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </label>
            <button className="btn danger" onClick={() => setConfirmReset(true)}>{t('settings.reset')}</button>
          </div>
        </section>
      </div>

      {confirmRestore && (
        <Confirm
          title={t('settings.restore')}
          message={t('settings.restoreBody', { n: Object.keys(confirmRestore.projects).length })}
          confirmLabel={t('settings.restore')}
          danger
          onClose={() => setConfirmRestore(null)}
          onConfirm={() => { replaceState(confirmRestore); toast(t('settings.restored')); }}
        />
      )}
      {confirmReset && (
        <Confirm
          title={t('settings.reset')}
          message={t('settings.resetBody')}
          confirmLabel={t('settings.reset')}
          danger
          onClose={() => setConfirmReset(false)}
          onConfirm={() => { replaceState({ schema: SCHEMA, settings: defaultSettings(), projects: {}, createdAt: new Date().toISOString() }); toast(t('settings.resetDone')); window.location.hash = '/'; }}
        />
      )}
    </div>
  );
}
