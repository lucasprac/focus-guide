import { useState, type ReactNode } from 'react';
import { Button, cn } from './ui';
import { Modal } from './components';

export type TutorialTarget = 'Settings' | 'Patterns' | 'Goals' | 'Calendar';
interface TutorialStep { title: string; body: ReactNode; target?: TutorialTarget; goLabel?: string }

const steps: TutorialStep[] = [
  { title: 'Learn from your own records', body: <>
    <p>Focus Guide can show patterns in how you focus. It uses only your own records.</p>
    <p>All data stays on this computer. The app does not score your attention. It shows what you did and what you reported.</p>
    <p>This tutorial takes about two minutes. You can open it again from Settings or from Patterns.</p></> },
  { title: 'Turn on keyboard and mouse totals', target: 'Settings', goLabel: 'Open Settings', body: <>
    <p>In Settings, turn on <strong>Collect keyboard and mouse totals</strong>. Then select <strong>Save preferences</strong>. It is off until you do this.</p>
    <p>Collection runs only while a focus session is running. It counts key presses, clicks, scrolls, mouse movement and changes of the front window.</p>
    <p>The app never saves typed text, key names, mouse positions, window titles or program names. To remove the data, use <strong>Delete collected activity</strong> in Settings.</p></> },
  { title: 'Answer attention check-ins', target: 'Settings', goLabel: 'Open Settings', body: <>
    <p>A check-in asks: &ldquo;Where is your attention right now?&rdquo; Select <strong>On the task</strong>, <strong>Drifting</strong> or <strong>Somewhere else</strong>. One click is enough.</p>
    <p>Check-ins are off by default. To turn them on, use <strong>Attention check-ins</strong> in Settings. To turn them off, clear it and save.</p>
    <p>The first check-in comes after 8 to 20 active minutes. The next ones come 15 to 35 minutes apart. If you do not answer in 45 seconds, the app saves it as missed. There are no check-ins in Offline mode, during a pause or during a break.</p></> },
  { title: 'Mark when you come back', body: <>
    <p>When you notice that your mind drifted, press <strong>Ctrl+Alt+Space</strong>. You can also use the small check button on the floating timer.</p>
    <p>This saves an <strong>I&rsquo;m back</strong> marker. Insights use these markers to see how long you focus before a drift. You can change the shortcut in Settings.</p></> },
  { title: 'Reflect after a session', target: 'Calendar', goLabel: 'Open Calendar', body: <>
    <p>After a session, the check-in has two optional questions: <strong>What got in the way most?</strong> and <strong>How demanding was it?</strong></p>
    <p>To remove an answer, select it again or select <strong>Clear</strong>. You can change the answers later with <strong>Edit</strong> in Calendar.</p>
    <p>To keep a session out of the insights, select <strong>Exclude this session from insights</strong>.</p></> },
  { title: 'Read the Insights tab', target: 'Patterns', goLabel: 'Open Patterns', body: <>
    <p>In Patterns, open the <strong>Insights</strong> tab. The date range, area and goal filters apply to it.</p>
    <p>At the top, <strong>The data behind these insights</strong> shows how many sessions and ratings the analysis uses.</p>
    <p>Each figure needs a minimum of data. For example, <em>When you focus best</em> needs 10 rated sessions. <em>What tends to go with higher focus</em> needs 30 rated sessions over 14 days. A figure with too little data tells you what is missing.</p></> },
  { title: 'Read the numbers with care', target: 'Patterns', goLabel: 'Open Patterns', body: <>
    <p>Intervals are 90% intervals. A wide interval means the result is uncertain. A missing value is a gap, not a zero.</p>
    <p>Your ratings and markers are what you reported. A pattern is an association. It does not show a cause.</p>
    <p>Each suggestion shows its numbers. <strong>Try next week</strong> adds it to your weekly adjustment, and you can edit it. To see how the tab looks with data, select <strong>Explore an example</strong>. The example uses invented sessions.</p></> },
  { title: 'See behaviour for one goal', target: 'Goals', goLabel: 'Open Goals', body: <>
    <p>Open a goal and select <strong>Behaviour</strong>. It shows how you study that goal: activity modes, times of day, roadmap steps, returns, interruptions and ratings.</p>
    <p>Choose 7 days, 30 days, 90 days or all time. Low collection coverage means the keyboard and mouse rates describe only a small part of the time.</p></> },
  { title: 'Optional: share insights with an AI agent', target: 'Settings', goLabel: 'Open Settings', body: <>
    <p>If you connect an AI agent, it can read the same insights with the tool <code>get_focus_insights</code>. Read-only access is enough.</p>
    <p>Access is off by default. When it is on, what the agent reads goes to its AI provider. Keep access off if you want your data to stay on this computer.</p></> }
];

/** Step-by-step guide to the behaviour features. Step position lives only in this component; nothing is saved. */
export default function BehaviourTutorial({ open, onClose, goTo }: { open: boolean; onClose: () => void; goTo: (target: TutorialTarget) => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index], last = index === steps.length - 1;
  const close = () => { onClose(); };
  const finish = () => { setIndex(0); onClose(); };
  return <Modal open={open} title="Behaviour tutorial" onClose={close}>
    <div className="tutorial" role="group" aria-label={`Step ${index + 1} of ${steps.length}`}>
      <p className="tiny-label">STEP {index + 1} OF {steps.length}</p>
      <h3 className="mt-1 text-title font-medium">{step.title}</h3>
      <div className="tutorial-body mt-2 space-y-2 text-ink">{step.body}</div>
      {step.target && <Button className="mt-3" size="sm" icon="arrow" onClick={() => { goTo(step.target!); onClose(); }}>{step.goLabel ?? 'Go there'}</Button>}
      <div className="mt-4 flex justify-center gap-2" aria-hidden="true">{steps.map((s, i) => <span key={s.title} className={cn('h-2 w-2 rounded-pill', i === index ? 'bg-accent' : 'bg-line-strong')} />)}</div>
    </div>
    <div className="modal-actions">
      <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</Button>
      {last ? <Button variant="primary" onClick={finish}>Done</Button> : <Button variant="primary" onClick={() => setIndex(index + 1)}>Next</Button>}
    </div>
  </Modal>;
}
