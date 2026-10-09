import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { decodeReturnCode } from '../lib/codec.js';
import { importClientSession } from '../store/actions.js';
import { navigate } from '../lib/router.jsx';
import { unpackSnapshot } from '../engine/snapshot.js';
import { Modal, toast } from '../components/ui.jsx';

/** Paste a client's return code or open the file they sent. */
export default function ImportDialog({ onClose, projectId }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const run = async (input) => {
    setError(null);
    let session;
    try {
      session = await decodeReturnCode(input);
      session.snapshotUsed = unpackSnapshot(session.snapshotUsed);
    } catch {
      setError(t('import.error.format'));
      return;
    }
    if (projectId && session.projectId !== projectId) {
      setError(t('import.error.otherProject'));
      return;
    }
    const res = importClientSession(session);
    if (!res.ok) {
      setError(t(`import.error.${res.error}`));
      return;
    }
    toast(res.unchanged ? t('import.unchanged') : res.createdVersion ? t('import.createdV1') : t('import.done'));
    onClose();
    navigate(`/projects/${res.projectId}/${res.createdVersion ? 'overview' : 'responses'}`);
  };

  return (
    <Modal
      title={t('import.title')}
      description={t('import.hint')}
      onClose={onClose}
      actions={
        <>
          <label className="btn" style={{ marginRight: 'auto' }}>
            {t('import.openFile')}
            <input type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) run(await f.text()); }} />
          </label>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => run(text)}>{t('import.action')}</button>
        </>
      }
    >
      <textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="SB1.…" aria-label={t('import.title')} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
      {error && <p className="error-box" style={{ marginTop: 12 }}>{error}</p>}
    </Modal>
  );
}
