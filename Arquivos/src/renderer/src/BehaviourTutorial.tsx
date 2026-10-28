import { useState, type ReactNode } from 'react';
import { Button, cn } from './ui';
import { Modal } from './components';
import { t } from '../../shared/i18n';

export type TutorialTarget = 'Settings' | 'Patterns' | 'Goals' | 'Calendar';
interface TutorialStep { title: string; body: ReactNode; target?: TutorialTarget; goLabel?: string }

const tutorialSteps = (): TutorialStep[] => [
  { get title() { return t('Learn from your own records'); }, body: <>
    <p>{t('Focus Guide can show patterns in how you focus. It uses only your own records.')}</p>
    <p>{t('All data stays on this computer. The app does not score your attention. It shows what you did and what you reported.')}</p>
    <p>{t('This tutorial takes about two minutes. You can open it again from Settings or from Patterns.')}</p></> },
  { get title() { return t('Turn on keyboard and mouse totals'); }, target: 'Settings', get goLabel() { return t('Open Settings'); }, body: <>
    <p>{t('In Settings, turn on')}{' '}<strong>{t('Collect keyboard and mouse totals')}</strong>{t('. Then select')}{' '}<strong>{t('Save preferences')}</strong>{t('. It is off until you do this.')}</p>
    <p>{t('Collection runs only while a focus session is running. It counts key presses, clicks, scrolls, mouse movement and changes of the front window.')}</p>
    <p>{t('The app never saves typed text, key names, mouse positions, window titles or program names. To remove the data, use')}{' '}<strong>{t('Delete collected activity')}</strong>{' '}{t('in Settings.')}</p></> },
  { get title() { return t('Answer attention check-ins'); }, target: 'Settings', get goLabel() { return t('Open Settings'); }, body: <>
    <p>{t('A check-in asks: “Where is your attention right now?” Select')}{' '}<strong>{t('On the task')}</strong>, <strong>{t('Drifting')}</strong>{' '}{t('or')}{' '}<strong>{t('Somewhere else')}</strong>{t('. One click is enough.')}</p>
    <p>{t('Check-ins are off by default. To turn them on, use')}{' '}<strong>{t('Attention check-ins')}</strong>{' '}{t('in Settings. To turn them off, clear it and save.')}</p>
    <p>{t('The first check-in comes after 8 to 20 active minutes. The next ones come 15 to 35 minutes apart. If you do not answer in 45 seconds, the app saves it as missed. There are no check-ins in Offline mode, during a pause or during a break.')}</p></> },
  { get title() { return t('Mark when you come back'); }, body: <>
    <p>{t('When you notice that your mind drifted, press')}{' '}<strong>Ctrl+Alt+Space</strong>{t('. You can also use the small check button on the floating timer.')}</p>
    <p>{t('This saves an')}{' '}<strong>{t('I’m back')}</strong>{t(' marker. Insights use these markers to see how long you focus before a drift. You can change the shortcut in Settings.')}</p></> },
  { get title() { return t('Reflect after a session'); }, target: 'Calendar', get goLabel() { return t('Open Calendar'); }, body: <>
    <p>{t('After a session, the check-in has two optional questions:')}{' '}<strong>{t('What got in the way most?')}</strong>{' '}{t('and')}{' '}<strong>{t('How demanding was it?')}</strong></p>
    <p>{t('To remove an answer, select it again or select')}{' '}<strong>{t('Clear')}</strong>{t('. You can change the answers later with')}{' '}<strong>{t('Edit')}</strong>{' '}{t('in Calendar.')}</p>
    <p>{t('To keep a session out of the insights, select')}{' '}<strong>{t('Exclude this session from insights')}</strong>.</p></> },
  { get title() { return t('Read the Insights tab'); }, target: 'Patterns', get goLabel() { return t('Open Patterns'); }, body: <>
    <p>{t('In Patterns, open the')}{' '}<strong>Insights</strong>{t(' tab. The date range, area and goal filters apply to it.')}</p>
    <p>{t('At the top,')}{' '}<strong>{t('The data behind these insights')}</strong>{' '}{t('shows how many sessions and ratings the analysis uses.')}</p>
    <p>{t('Each figure needs a minimum of data. For example,')}{' '}<em>{t('When you focus best')}</em>{' '}{t('needs 10 rated sessions.')}{' '}<em>{t('What tends to go with higher focus')}</em>{' '}{t('needs 30 rated sessions over 14 days. A figure with too little data tells you what is missing.')}</p></> },
  { get title() { return t('Read the numbers with care'); }, target: 'Patterns', get goLabel() { return t('Open Patterns'); }, body: <>
    <p>{t('Intervals are 90% intervals. A wide interval means the result is uncertain. A missing value is a gap, not a zero.')}</p>
    <p>{t('Your ratings and markers are what you reported. A pattern is an association. It does not show a cause.')}</p>
    <p>{t('Each suggestion shows its numbers.')}{' '}<strong>{t('Try next week')}</strong>{' '}{t('adds it to your weekly adjustment, and you can edit it. To see how the tab looks with data, select')}{' '}<strong>{t('Explore an example')}</strong>{t('. The example uses invented sessions.')}</p></> },
  { get title() { return t('See behaviour for one goal'); }, target: 'Goals', get goLabel() { return t('Open Goals'); }, body: <>
    <p>{t('Open a goal and select')}{' '}<strong>{t('Behaviour')}</strong>{t('. It shows how you study that goal: activity modes, times of day, roadmap steps, returns, interruptions and ratings.')}</p>
    <p>{t('Choose 7 days, 30 days, 90 days or all time. Low collection coverage means the keyboard and mouse rates describe only a small part of the time.')}</p></> },
  { get title() { return t('Optional: share insights with an AI agent'); }, target: 'Settings', get goLabel() { return t('Open Settings'); }, body: <>
    <p>{t('If you connect an AI agent, it can read the same insights with the tool')}{' '}<code>get_focus_insights</code>{t('. Read-only access is enough.')}</p>
    <p>{t('Access is off by default. When it is on, what the agent reads goes to its AI provider. Keep access off if you want your data to stay on this computer.')}</p></> }
];

/** Step-by-step guide to the behaviour features. Step position lives only in this component; nothing is saved. */
export default function BehaviourTutorial({ open, onClose, goTo }: { open: boolean; onClose: () => void; goTo: (target: TutorialTarget) => void }) {
  const [index, setIndex] = useState(0);
  const steps = tutorialSteps(), step = steps[index], last = index === steps.length - 1;
  const close = () => { onClose(); };
  const finish = () => { setIndex(0); onClose(); };
  return <Modal open={open} title={t('Behaviour tutorial')} onClose={close}>
    <div className="tutorial" role="group" aria-label={t('Step {v1} of {length}', { v1: index + 1, length: steps.length })}>
      <p className="tiny-label">{t('STEP {v1} OF {length}', { v1: index + 1, length: steps.length })}</p>
      <h3 className="mt-1 text-title font-medium">{step.title}</h3>
      <div className="tutorial-body mt-2 space-y-2 text-ink">{step.body}</div>
      {step.target && <Button className="mt-3" size="sm" icon="arrow" onClick={() => { goTo(step.target!); onClose(); }}>{step.goLabel ?? t('Go there')}</Button>}
      <div className="mt-4 flex justify-center gap-2" aria-hidden="true">{steps.map((s, i) => <span key={s.title} className={cn('h-2 w-2 rounded-pill', i === index ? 'bg-accent' : 'bg-line-strong')} />)}</div>
    </div>
    <div className="modal-actions">
      <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>{t('Back')}</Button>
      {last ? <Button variant="primary" onClick={finish}>{t('Done')}</Button> : <Button variant="primary" onClick={() => setIndex(index + 1)}>{t('Next')}</Button>}
    </div>
  </Modal>;
}
