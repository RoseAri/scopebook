import { useEffect, useRef, useState } from 'react';
import { LANGS, useI18n } from '../i18n/index.jsx';

// ---------- Toast ----------
const toastListeners = new Set();
export function toast(message) {
  toastListeners.forEach((l) => l(message));
}
export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let timer;
    const l = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    toastListeners.add(l);
    return () => toastListeners.delete(l);
  }, []);
  return msg ? (
    <div className="toast" role="status" aria-live="polite">
      {msg}
    </div>
  ) : null;
}

// ---------- Modal ----------
export function Modal({ title, children, onClose, actions, wide, description }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, textarea, select, button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        {title && <h2>{title}</h2>}
        {description && <p className="muted small" style={{ marginBottom: 18 }}>{description}</p>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

// ---------- Fields ----------
export function Field({ label, help, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, ...rest }) {
  return <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function NumberInput({ value, onChange, className = '', ...rest }) {
  return (
    <input
      className={`input num ${className}`}
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, ...rest }) {
  return <textarea className="textarea" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...rest}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return <Segmented label={t('common.language')} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />;
}

// ---------- Information sources ----------
export function SourceTag({ source }) {
  const { t } = useI18n();
  const key = { client: 'source.client', system: 'source.system', designer: 'source.designer', assumption: 'source.assumption', mixed: 'source.mixed' }[source] || 'source.system';
  return <span className={`tag ${source === 'mixed' ? 'designer' : source}`}>{t(key)}</span>;
}

export function Level({ value, kind = 'risk' }) {
  const { t } = useI18n();
  if (!value) return <span className="faint">—</span>;
  return (
    <span className="dotline">
      <span className={`dot ${kind === 'confidence' ? { low: 'high', medium: 'medium', high: 'low' }[value] : value}`} />
      <span>{t(`level.${value}`)}</span>
    </span>
  );
}

export function Progress({ value }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Confirm({ title, message, confirmLabel, onConfirm, onClose, danger }) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}
