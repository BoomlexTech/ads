import { useRef, useState } from 'react';
import { METRICS, editText, allowedPattern } from '../../../shared/metrics.js';

// Admin-only inline editors. Double-click to edit; Enter saves, Esc cancels, leaving
// the field saves. When editing is off they just render their display.
// multiline: a text box for several lines (Enter starts a new line, Ctrl+Enter saves).
// clickToEdit: a single click (or Enter / Space on the focused text) opens the editor too.

export function EditText({
  value, canEdit, onSave, children, maxLength = 200, digits = false, className = '', label, multiline = false, clickToEdit = false, placeholder,
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const done = useRef(false);
  if (!canEdit) return children ?? value ?? null;
  const start = (e) => { e.stopPropagation(); e.preventDefault(); done.current = false; setText(value ?? ''); setEditing(true); };
  if (!editing) {
    return (
      <span className={`editable ${className}`} title={clickToEdit ? 'Click to edit' : 'Double-click to edit'} data-edit={label}
        onDoubleClick={start}
        {...(clickToEdit && {
          role: 'button', tabIndex: 0, 'aria-label': `Edit ${label || 'text'}`, onClick: start,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') start(e); },
        })}>
        {children ?? value}
      </span>
    );
  }
  const commit = () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (text !== (value ?? '')) onSave(text);
  };
  if (multiline) {
    return (
      <textarea className="inline-input inline-area" autoFocus value={text} maxLength={maxLength} aria-label={`Edit ${label || 'text'}`}
        rows={Math.max(3, Math.min(8, text.split('\n').length + 1))} placeholder={placeholder}
        title="Enter starts a new line. Ctrl+Enter or clicking away saves, Esc cancels."
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
          if (e.key === 'Escape') { done.current = true; setEditing(false); }
        }}
        onBlur={commit} />
    );
  }
  return (
    <input className={`inline-input ${digits ? 'digits' : ''}`} autoFocus value={text} maxLength={maxLength} aria-label={`Edit ${label || 'text'}`}
      size={Math.max(4, Math.min(48, text.length + 2))} placeholder={placeholder}
      inputMode={digits ? 'numeric' : undefined}
      onFocus={(e) => e.target.select()}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => { if (!digits || /^\d{0,2}$/.test(e.target.value)) setText(e.target.value); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done.current = true; setEditing(false); }
      }}
      onBlur={commit} />
  );
}

export function EditSelect({ value, options, canEdit, onSave, children, label }) {
  const [editing, setEditing] = useState(false);
  if (!canEdit) return children ?? value ?? null;
  if (!editing) {
    return (
      <span className="editable" title="Double-click to change" data-edit={label}
        onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditing(true); }}>
        {children ?? value}
      </span>
    );
  }
  return (
    <select className="inline-select" autoFocus value={value ?? ''} aria-label={`Change ${label || 'value'}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { setEditing(false); if (e.target.value !== (value ?? '')) onSave(e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
      onBlur={() => setEditing(false)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

// Number box for any metric column: digits (and one decimal point for money,
// decimals and percentages) only; letters can't be typed or pasted.
export function MetricInput({ metric, value, onCommit, onCancel, className = 'cell-input' }) {
  const [text, setText] = useState(editText(metric, value));
  const pattern = allowedPattern(metric);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (text === editText(metric, value)) return onCancel();
    onCommit(text);
  };
  return (
    <input className={className} autoFocus value={text} aria-label={`Edit ${METRICS[metric].label}`}
      inputMode={METRICS[metric].kind === 'int' ? 'numeric' : 'decimal'}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { if (pattern.test(e.target.value)) setText(e.target.value); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done.current = true; onCancel(); }
      }}
      onBlur={commit} />
  );
}
