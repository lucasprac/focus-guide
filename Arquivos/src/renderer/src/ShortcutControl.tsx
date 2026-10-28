import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Action } from './App';
import { shortcut } from '../../shared/validation';
import { Button } from './ui';

export function ShortcutControl({ value, onChange, act, visible }: { value: string; onChange: (value: string) => void; act: Action; visible: boolean }) {
  const [capturing, setCapturing] = useState(false), [message, setMessage] = useState('');
  const active = useRef(false), ready = useRef(false), hintId = useId();
  const action = useRef(act), change = useRef(onChange);
  action.current = act; change.current = onChange;
  const cancel = () => {
    if (!active.current) return;
    active.current = false; ready.current = false; setCapturing(false); setMessage('');
    void action.current('shortcut.capture', { enabled: false });
  };
  const accept = (combination: string) => { cancel(); change.current(shortcut(combination)); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden);
    const remove = window.focusGuide.onEvent(event => {
      // Windows consumes the already registered combination before DOM keydown.
      if (event.type === 'shortcut-captured' && active.current) accept(event.shortcut);
      if (event.type === 'visibility' && !event.visible) cancel();
    });
    return () => { cancel(); remove(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => { if (!visible) cancel(); }, [visible]);
  useEffect(() => { if (!capturing) return; const timeout = window.setTimeout(cancel, 30000); return () => window.clearTimeout(timeout); }, [capturing]);
  const begin = async () => {
    if (active.current) { cancel(); return; }
    active.current = true; setCapturing(true); setMessage('Preparando a captura do teclado…');
    const result = await act('shortcut.capture', { enabled: true });
    if (!active.current) return;
    if (!result.ok) { cancel(); setMessage(result.error); return; }
    ready.current = true; setMessage('Pressione um modificador e uma tecla. Esc cancela.');
  };
  const capture = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!active.current) return;
    if (event.key === 'Tab') { cancel(); return; }
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { cancel(); return; }
    if (!ready.current || event.repeat || event.nativeEvent.isComposing) return;
    const modifiers = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win'].filter(Boolean);
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    const key = event.code === 'Space' ? 'Space' : /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/, '') : /^F([1-9]|1[0-9]|2[0-4])$/.test(event.key) ? event.key : '';
    if (!key || !modifiers.length || event.getModifierState('AltGraph')) { setMessage('Use Ctrl, Alt, Shift ou Win com Space, uma letra, um número ou uma tecla F.'); return; }
    accept([...modifiers, key].join('+'));
  };
  return <div className="shortcut-control" role="group" aria-label="Atalho global do Voltei">
    <span className="form-label">Atalho global do Voltei</span>
    <div className="shortcut-actions">
      <span className="shortcut-value" aria-label={`Atalho atual: ${value || 'Desativado'}`}>{value ? value.split('+').map((key, index) => <span key={key}>{index > 0 && <span className="shortcut-plus">+</span>}<kbd>{key}</kbd></span>) : 'Desativado'}</span>
      <Button className={`shortcut-record ${capturing ? 'capturing' : ''}`} aria-pressed={capturing} aria-describedby={hintId} onClick={() => void begin()} onKeyDown={capture} onBlur={cancel}>{capturing ? 'Pressione o atalho…' : 'Alterar atalho'}</Button>
      <Button variant="ghost" size="sm" disabled={capturing || !value} onClick={() => onChange('')}>Desativar atalho</Button>
    </div>
    <span id={hintId} className="hint" role="status">{message || 'Clique em Alterar atalho e pressione a combinação. Salve as preferências para aplicá-la.'}</span>
  </div>;
}
