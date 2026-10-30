import { JEV_CAUSES, type DetractorAnswers, type JevCause, type ReflectionText } from '../shared/jev-decisions';
import { t } from '../shared/i18n';

/* All wording sent to TypeSafe Jev is in this file, so it can be read and changed in one place. Questions are in
   English, the model's primary language; the state keeps the user's own words. Change QUESTION_SET when the wording
   changes, so a logged request can be traced to the wording that produced it. */
export const JEV_MODEL = 'jev-1.14.0';
export const REFLECTION_QUESTION_SET = 'reflection-detractor@2';

export interface JevQuestion { type: 'noul' | 'choice'; instructions: string; criteria?: Record<string, string> }
export interface JevRequest { model: string; state: Record<string, unknown>; questions: Record<string, JevQuestion> }

const CAUSE_QUESTIONS: Record<JevCause, JevQuestion> = {
  notifications: { type: 'noul', instructions: 'Does `session` say that a phone, messages or notifications distracted the person during the session?', criteria: { true: 'The text names a phone, a message, a notification, social media or email that took attention during the session.', false: 'The text names no phone, message or notification, or names one only as part of the planned work.' } },
  people: { type: 'noul', instructions: 'Does `session` say that other people or noise interrupted the person during the session?', criteria: { true: 'The text names someone who talked to or called the person, or a noise around them, during the session.', false: 'The text names no other person and no noise during the session. A message or notification on a device counts as a notification, not as a person.' } },
  thoughts: { type: 'noul', instructions: 'Does `session` say that the person\'s own thoughts wandered away from the work during the session?', criteria: { true: 'The text says the mind wandered, the person daydreamed, worried, or kept thinking about something unrelated to the work.', false: 'The text describes thinking only about the work itself.' } },
  tiredness: { type: 'noul', instructions: 'Does `session` say that the person was tired, sleepy or hungry during the session?', criteria: { true: 'The text says the person felt tired, sleepy, exhausted, low on energy or hungry.', false: 'The text says nothing about tiredness, sleep or hunger, or says the person felt rested.' } },
  task: { type: 'noul', instructions: 'Does `session` say that the task was unclear, too hard or blocked during the session?', criteria: { true: 'The text says the person did not know what to do next, got stuck, or found the work too difficult.', false: 'The text describes the work as clear and possible to continue.' } }
};
/* Choice option names describe the content; the model reads them. */
const MAIN_CAUSE_OPTIONS: Record<string, JevCause> = { phone_or_notifications: 'notifications', people_or_noise: 'people', wandering_thoughts: 'thoughts', tiredness_or_hunger: 'tiredness', unclear_or_hard_task: 'task' };

/* State holds only what a person would read to answer: the session's own text, with empty parts left out. */
export function reflectionRequest(text: ReflectionText): JevRequest {
  const session: Record<string, unknown> = {};
  if (text.intention) session.intention_before_session = text.intention;
  if (text.note) session.note_after_session = text.note;
  if (text.thoughts.length) session.ideas_parked_during_session = text.thoughts;
  if (text.interruptions.length) session.interruption_notes = text.interruptions;
  return {
    model: JEV_MODEL, state: { session },
    questions: {
      any_problem: { type: 'noul', instructions: 'Does the writing in `session` say that something hurt the person\'s focus during this work session?', criteria: { true: 'The person names something that interrupted, distracted, tired or slowed them during the session.', false: 'The person describes only the work, its result or their plan, and names no difficulty with focus.' } },
      ...Object.fromEntries(JEV_CAUSES.map(cause => [`cause_${cause}`, CAUSE_QUESTIONS[cause]])),
      main_cause: { type: 'choice', instructions: 'Which of these hurt the person\'s focus most during the session in `session`?', criteria: { phone_or_notifications: 'A phone, messages, notifications, social media or email.', people_or_noise: 'Other people talking or calling, or noise around the person.', wandering_thoughts: 'The person\'s own thoughts about things unrelated to the work.', tiredness_or_hunger: 'Feeling tired, sleepy, low on energy or hungry.', unclear_or_hard_task: 'Not knowing what to do next, being stuck, or the work being too difficult.' } }
    }
  };
}

/* Reads the answers to reflectionRequest. A missing or malformed answer is an error, never a "no". */
export function readReflection(answers: Record<string, unknown>): DetractorAnswers {
  const noul = (name: string): number => {
    const value = (answers[name] as { noul?: unknown } | undefined)?.noul;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(t('TypeSafe returned an answer that Focus Guide cannot read.'));
    return value;
  };
  const choice = (answers.main_cause as { choice?: unknown } | undefined)?.choice;
  if (typeof choice !== 'string' || !Object.hasOwn(MAIN_CAUSE_OPTIONS, choice)) throw new Error(t('TypeSafe returned an answer that Focus Guide cannot read.'));
  return { anyProblem: noul('any_problem'), causes: Object.fromEntries(JEV_CAUSES.map(cause => [cause, noul(`cause_${cause}`)])) as Record<JevCause, number>, mainCause: MAIN_CAUSE_OPTIONS[choice] };
}
