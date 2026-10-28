import { Children, cloneElement, isValidElement, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { Dialog, AlertDialog, Select, Switch, Checkbox, Collapsible, ToggleGroup, Tooltip, Tabs as RadixTabs } from 'radix-ui';
import { Icon, type IconName } from './icons';
import { t } from '../../shared/i18n';

type Change<T> = { target: T };
interface ChoiceProps {
  value: string; onChange: (event: Change<{ value: string }>) => void; children: ReactNode;
  disabled?: boolean; className?: string; 'aria-label'?: string; id?: string;
}
export function Choice({ value, onChange, children, disabled, className = '', ...label }: ChoiceProps) {
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const props = child.props as { value?: string; children: ReactNode; disabled?: boolean };
    return { value: props.value ?? String(props.children), text: props.children, disabled: props.disabled };
  });
  // Encode all domain values so the empty option remains selectable in Radix.
  const encode = (value: string) => `choice:${value}`;
  return <Select.Root value={encode(value)} disabled={disabled} onValueChange={next => onChange({ target: { value: next.slice(7) } })}>
    <Select.Trigger {...label} className={`choice-trigger ${className}`} data-value={value}>
      <Select.Value /><Select.Icon className="choice-chevron inline-flex"><Icon name="chevron-down" size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="choice-menu" position="popper" sideOffset={6} collisionPadding={12}>
      <Select.ScrollUpButton className="choice-scroll flex items-center justify-center"><Icon name="chevron-up" size={16} /></Select.ScrollUpButton>
      <Select.Viewport>{options.map(option => <Select.Item key={option.value} value={encode(option.value)} disabled={option.disabled} className="choice-item" data-value={option.value}>
        <Select.ItemText>{option.text}</Select.ItemText><Select.ItemIndicator className="inline-flex text-accent"><Icon name="check" size={16} strokeWidth={2} /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="choice-scroll flex items-center justify-center"><Icon name="chevron-down" size={16} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
interface CheckProps {
  checked: boolean; onChange: (event: Change<{ checked: boolean }>) => void;
  disabled?: boolean; 'aria-label'?: string; id?: string; className?: string;
}
export function CheckControl({ checked, onChange, className = '', ...props }: CheckProps) {
  return <Checkbox.Root {...props} className={`check-control ${className}`} checked={checked} onCheckedChange={value => onChange({ target: { checked: value === true } })}>
    <Checkbox.Indicator aria-hidden="true" className="inline-flex"><Icon name="check" size={14} strokeWidth={2.4} /></Checkbox.Indicator>
  </Checkbox.Root>;
}
export function SwitchControl({ checked, onChange, className = '', ...props }: CheckProps) {
  return <Switch.Root {...props} className={`switch-control ${className}`} checked={checked} onCheckedChange={checked => onChange({ target: { checked } })}><Switch.Thumb className="switch-thumb" /></Switch.Root>;
}
export function Segments({ value, onChange, label, options, className = '' }: {
  value: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string; ariaLabel?: string }>; className?: string;
}) {
  return <ToggleGroup.Root type="single" value={value} onValueChange={onChange} aria-label={label} className={className}>
    {options.map(option => <ToggleGroup.Item key={option.value} value={option.value} aria-label={option.ariaLabel ?? option.label} className={value === option.value ? 'selected' : ''}>{option.label}</ToggleGroup.Item>)}
  </ToggleGroup.Root>;
}
/* Page-level tabs. Only the selected panel is mounted, so a panel can load its data when it opens. */
export function Tabs({ value, onChange, label, tabs, className }: {
  value: string; onChange: (value: string) => void; label: string; tabs: Array<{ value: string; label: string; content: ReactNode }>; className?: string;
}) {
  return <RadixTabs.Root value={value} onValueChange={onChange} className={cn('page-tabs', className)}>
    <RadixTabs.List aria-label={label} className="page-tabs-list mb-5 flex gap-1 border-b border-line">
      {tabs.map(tab => <RadixTabs.Trigger key={tab.value} value={tab.value} className="page-tab -mb-px border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-label font-medium text-ink-muted transition-colors duration-150 ease-standard hover:text-ink data-[state=active]:border-accent data-[state=active]:text-accent">{tab.label}</RadixTabs.Trigger>)}
    </RadixTabs.List>
    {tabs.map(tab => <RadixTabs.Content key={tab.value} value={tab.value} className="page-tab-panel focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{tab.content}</RadixTabs.Content>)}
  </RadixTabs.Root>;
}
/* Card disclosures stand alone; inline ones use display: contents so the trigger can sit in a
   parent toolbar grid while the content spans the next row (content keeps col-span-full). */
export function Fold({ title, children, open, onOpenChange, variant = 'card', icon, badge, className, contentClassName }: {
  title: string; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void;
  variant?: 'card' | 'inline'; icon?: IconName; badge?: ReactNode; className?: string; contentClassName?: string;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  const inline = variant === 'inline';
  return <Collapsible.Root className={cn('disclosure', inline && 'contents', className)} open={expanded} onOpenChange={onOpenChange ?? setLocalOpen}>
    <Collapsible.Trigger className={cn('disclosure-trigger', inline && 'w-auto justify-start gap-1.5 rounded-control px-3 py-2 text-label font-medium whitespace-nowrap text-ink transition-colors duration-150 ease-standard hover:bg-accent-soft')}>
      {icon && <Icon name={icon} size={16} className="text-ink-muted" />}{title}{badge && <span className="inline-flex transform-none">{badge}</span>}<span aria-hidden="true" className="inline-flex"><Icon name="chevron" size={inline ? 16 : 18} strokeWidth={2} /></span>
    </Collapsible.Trigger>
    <Collapsible.Content className={cn('fold-content', inline && 'col-span-full')} forceMount inert={!expanded}><div className={cn('disclosure-content', inline && 'p-0', contentClassName)}>{children}</div></Collapsible.Content>
  </Collapsible.Root>;
}
export function Hint({ label, children, enabled = true }: { label: string; children: ReactNode; enabled?: boolean }) {
  if (!enabled) return <>{children}</>;
  return <Tooltip.Provider delayDuration={350}><Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className="tooltip-content" side="right" sideOffset={8}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root></Tooltip.Provider>;
}
export function Overlay({ open, title, children, onClose, wide = false, destructive = false, busy = false, description }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean; destructive?: boolean; busy?: boolean; description?: string;
}) {
  const lastContent = useRef(children), opener = useRef<HTMLElement | null>(null);
  if (open) lastContent.current = children;
  const contentProps = {
    className: `modal ${wide ? 'wide' : ''}`,
    onOpenAutoFocus: (event: Event) => {
      opener.current = document.activeElement as HTMLElement | null;
      if (destructive) {
        event.preventDefault();
        (event.target as HTMLElement).querySelector<HTMLElement>('button:not([disabled])')?.focus();
      }
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('.nav-item[aria-current="page"]');
      target?.focus();
    },
    onEscapeKeyDown: (event: KeyboardEvent) => { if (busy) event.preventDefault(); }
  };
  const closeButton = <button type="button" disabled={busy} className="icon-button modal-close" onClick={onClose} aria-label={t('Close dialog')}><Icon name="close" size={20} /></button>;
  if (destructive) return <AlertDialog.Root open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <AlertDialog.Portal><AlertDialog.Overlay className="modal-shade" /><AlertDialog.Content {...contentProps}>
      {closeButton}<AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description className="sr-only">{description ?? t('Review the consequences before continuing.')}</AlertDialog.Description>{open ? children : lastContent.current}
    </AlertDialog.Content></AlertDialog.Portal>
  </AlertDialog.Root>;
  return <Dialog.Root open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="modal-shade" /><Dialog.Content {...contentProps} aria-describedby={undefined} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      {closeButton}<Dialog.Title>{title}</Dialog.Title>{open ? children : lastContent.current}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

/* Base components. Each keeps a legacy class as a stable test hook; Tailwind utilities
   in the later layer define the refreshed appearance. */
export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(' '); }

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const buttonHooks: Record<ButtonVariant, string> = { primary: 'primary', secondary: 'secondary', ghost: 'text-button', danger: 'danger-button' };
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-on-accent hover:enabled:border-accent-hover hover:enabled:bg-accent-hover',
  secondary: 'border-line-strong bg-surface text-ink hover:enabled:bg-accent-soft',
  ghost: 'border-transparent bg-transparent text-ink-muted hover:enabled:bg-accent-soft hover:enabled:text-accent',
  danger: 'border-danger bg-surface text-danger hover:enabled:bg-danger-soft'
};
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: IconName };
export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={cn(buttonHooks[variant], 'inline-flex items-center justify-center gap-2 rounded-control border font-medium transition-colors duration-150 ease-standard disabled:cursor-default disabled:opacity-45',
    size === 'md' ? 'min-h-11 px-4 py-2 text-label' : 'min-h-9 px-3 py-1.5 text-caption', buttonVariants[variant], className)}>
    {icon && <Icon name={icon} size={size === 'md' ? 18 : 16} />}{children}
  </button>;
}
type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string; tooltip?: boolean; tone?: 'neutral' | 'danger' };
export function IconButton({ icon, label, tooltip = true, tone = 'neutral', className, type = 'button', ...props }: IconButtonProps) {
  const button = <button {...props} type={type} aria-label={label} className={cn('icon-button inline-flex size-9 items-center justify-center rounded-control border-0 bg-transparent p-0 transition-colors duration-150 ease-standard disabled:cursor-default disabled:opacity-45',
    tone === 'danger' ? 'text-danger hover:enabled:bg-danger-soft' : 'text-ink-muted hover:enabled:bg-accent-soft hover:enabled:text-accent', className)}><Icon name={icon} size={18} /></button>;
  return <Hint label={label} enabled={tooltip}>{button}</Hint>;
}

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode; icon?: IconName; actions?: ReactNode; headingLevel?: 2 | 3 };
export function Card({ title, icon, actions, headingLevel = 2, className, children, ...props }: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <section {...props} className={cn('panel rounded-card border border-line bg-surface p-5 shadow-elevation-1', className)}>
    {(title || actions) && <div className="section-title mb-4 flex items-center justify-start gap-2.5">
      {icon && <Icon name={icon} className="shrink-0 text-accent" />}
      {title && <Heading className="text-title font-medium text-ink">{title}</Heading>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>}
    {children}
  </section>;
}

/* A card framed like a technical figure plate: "Fig n" and the title on top, a hint and a live readout below.
   It keeps the legacy panel base, so page rules such as .focus-stage still apply. Write the readout through
   a [data-readout] query when it changes every frame; it is not a live region, so it never interrupts a reader. */
type PlateProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & { fig: number; title?: ReactNode; hint?: ReactNode; readout?: ReactNode; actions?: ReactNode; headingLevel?: 2 | 3 };
export function Plate({ fig, title, hint, readout, actions, headingLevel = 2, className, children, ...props }: PlateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <section {...props} className={cn('plate panel rounded-card shadow-elevation-lift', className)}>
    <div className="plate-head mb-4 flex min-w-0 items-center gap-3 font-mono text-caption text-ink-muted">
      <span className="plate-fig shrink-0 text-ink">Fig {fig}</span>
      {title && <Heading className="plate-title ml-auto flex min-w-0 items-center gap-2 truncate text-right font-mono text-caption font-normal tracking-wide text-ink-muted">{title}</Heading>}
      {actions && <div className={cn('flex shrink-0 items-center gap-2', !title && 'ml-auto')}>{actions}</div>}
    </div>
    {children}
    {(hint || readout !== undefined) && <div className="plate-foot mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 font-mono text-caption text-ink-muted">
      <span className="plate-hint tracking-wide">{hint}</span>
      {readout !== undefined && <span className="plate-readout ml-auto text-right text-ink tabular-nums" data-readout="">{readout}</span>}
    </div>}
  </section>;
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-heading mb-5 flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-display font-medium text-ink">{title}</h1>
      {description && <p className="mt-1.5 max-w-[660px] text-caption text-ink-muted">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
  </header>;
}

/* Labels one control and links its hint and error through aria-describedby. */
export function Field({ label, hint, error, optional = false, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; children: ReactElement<Record<string, unknown>>; className?: string }) {
  const id = useId(), hintId = `${id}-hint`, errorId = `${id}-error`;
  const describedBy = cn(hint ? hintId : null, error ? errorId : null) || undefined;
  const control = isValidElement(children) ? cloneElement(children, { id: (children.props.id as string | undefined) ?? id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children;
  return <div className={cn('field my-3 grid gap-2', className)}>
    <label htmlFor={(children.props.id as string | undefined) ?? id} className="text-label font-medium text-ink">{label}{optional && <span className="ml-2 text-caption font-normal text-ink-muted">{t('optional')}</span>}</label>
    {control}
    {hint && <span id={hintId} className="text-caption text-ink-muted">{hint}</span>}
    {error && <span id={errorId} className="text-caption text-danger">{error}</span>}
  </div>;
}

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'danger';
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-line bg-canvas text-ink-muted', accent: 'border-transparent bg-accent-soft text-accent', info: 'border-transparent bg-info-soft text-info',
  success: 'border-transparent bg-success-soft text-success', danger: 'border-transparent bg-danger-soft text-danger'
};
export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('badge inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-badge font-medium', badgeTones[tone], className)}>{children}</span>;
}

export function EmptyState({ title, children, action, icon = 'spark' }: { title: string; children?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return <div className="empty-state flex items-center gap-4 rounded-card border border-dashed border-line px-5 py-4 text-left">
    <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-accent-soft text-accent"><Icon name={icon} size={20} /></span>
    <div className="min-w-0 flex-1">
      <h3 className="m-0 text-label font-medium text-ink">{title}</h3>
      {children && <p className="mt-0.5 text-caption text-ink-muted">{children}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

/* Asks before a form with unsaved edits closes. Pass requestClose as the Overlay's onClose so an
   outside click, Escape, the close button and Cancel all go through the same confirmation. */
export function useDiscardGuard(dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false);
  const requestClose = () => { if (dirty) setAsking(true); else onClose(); };
  const discardDialog = <Overlay open={asking} destructive title={t('Discard your changes?')} description={t('Your edits in this form have not been saved.')} onClose={() => setAsking(false)}>
    <p className="modal-intro">{t('What you entered in this form has not been saved yet.')}</p>
    <div className="modal-actions"><Button onClick={() => setAsking(false)}>{t('Keep editing')}</Button><Button variant="danger" onClick={() => { setAsking(false); onClose(); }}>{t('Discard')}</Button></div>
  </Overlay>;
  return { requestClose, discardDialog };
}

/* Multi-select chips from suggestions plus custom entries. Custom entries matching a suggestion
   take the suggestion's spelling, so a tag never appears twice with different capitalisation. */
export function TagPicker({ value, onChange, suggestions, limit, maxLength, label, disabled }: {
  value: string[]; onChange: (value: string[]) => void; suggestions: string[]; limit: number; maxLength: number; label: string; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(''), [message, setMessage] = useState('');
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const add = () => {
    const typed = draft.replace(/\s+/g, ' ').trim().slice(0, maxLength); if (!typed) return;
    const tag = suggestions.find(s => same(s, typed)) ?? typed;
    if (value.some(t => same(t, tag))) { setMessage(t('{tag} is already chosen.', { tag })); return; }
    if (value.length >= limit) { setMessage(t('Choose up to {limit} tags.', { limit })); return; }
    onChange([...value, tag]); setDraft(''); setMessage('');
  };
  const custom = value.filter(t => !suggestions.includes(t));
  return <div className="tag-picker">
    <ToggleGroup.Root type="multiple" aria-label={label} disabled={disabled} className="tag-options" value={value.filter(t => suggestions.includes(t))} onValueChange={next => {
      const added = next.filter(t => !value.includes(t));
      if (added.length && value.length >= limit) { setMessage(t('Choose up to {limit} tags.', { limit })); return; }
      onChange([...value.filter(t => next.includes(t) || !suggestions.includes(t)), ...added]); setMessage('');
    }}>
      {suggestions.map(tag => <ToggleGroup.Item key={tag} value={tag} className="tag-chip">{tag}</ToggleGroup.Item>)}
      {custom.map(tag => <span key={tag} className="tag-chip custom" data-state="on">{tag}<button type="button" disabled={disabled} aria-label={t('Remove tag: {tag}', { tag })} onClick={() => onChange(value.filter(t => t !== tag))}><Icon name="close" size={14} /></button></span>)}
    </ToggleGroup.Root>
    <div className="tag-add"><input aria-label={t('Add your own tag')} placeholder={t('Add your own…')} maxLength={maxLength} disabled={disabled} value={draft} onChange={e => { setDraft(e.target.value); setMessage(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /><Button size="sm" disabled={disabled || !draft.trim()} onClick={add}>{t('Add tag')}</Button></div>
    <span className="hint" role="status">{message || t('{length} of {limit} chosen', { length: value.length, limit })}</span>
  </div>;
}
