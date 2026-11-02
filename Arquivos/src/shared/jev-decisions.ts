import type { Detractor } from './types';

/* Decisions made from TypeSafe Jev judgments. Jev answers one question at a time with a probability; the truth tables
   here turn those answers into a suggestion. The question wording is in main/jev-questions.ts. See Docs/JEV-USE-CASES.md. */

/* A Noul above YES reads as yes, below NO as no; the band between them does not settle the question. */
export const JEV_THRESHOLDS = { yes: 0.7, no: 0.3 } as const;
/* Reflection gap-fill looks back this many days and checks at most this many sessions per scan. */
export const JEV_GAP_LIMITS = { days: 90, sessions: 50 } as const;

/* The detractors that a text can name. 'none' and 'other' come from the truth table, not from a question. */
export const JEV_CAUSES = ['notifications', 'people', 'thoughts', 'tiredness', 'task'] as const;
export type JevCause = typeof JEV_CAUSES[number];

/* The text of one session, exactly as the user wrote it. Empty parts are left out of the request. */
export interface ReflectionText { intention: string; note: string; thoughts: string[]; interruptions: string[] }
export interface DetractorAnswers { anyProblem: number; causes: Record<JevCause, number>; mainCause: JevCause }
export interface DetractorDecision { status: 'clear' | 'unclear'; suggestion: Detractor | null; alternatives: Detractor[] }

/* One result of jev.gaps.scan. Nothing is saved until the user picks an answer. */
export interface JevReflectionGap extends Partial<Omit<DetractorDecision, 'status'>> {
  sessionId: string; startedAt: string; timezone: string; fieldName: string; intention: string; note: string;
  status: 'clear' | 'unclear' | 'error'; error?: string;
}

/* Truth table for UC-C1. The cause Nouls decide; the general Noul only separates 'none' from 'other' when no cause fits
   (a text can name a cause, such as being stuck, without calling it a focus problem).
   one cause > YES                         → that cause
   several causes > YES                    → the main-cause Choice if its own Noul is > YES, else the strongest; the others are alternatives
   every cause < NO, any problem < NO      → 'none'
   every cause < NO, any problem > YES     → 'other'
   anything else (a cause or the general
   question between NO and YES)            → no suggestion */
export function decideDetractor(answers: DetractorAnswers): DetractorDecision {
  const { yes, no } = JEV_THRESHOLDS;
  const named = JEV_CAUSES.filter(cause => answers.causes[cause] > yes).sort((a, b) => answers.causes[b] - answers.causes[a]);
  if (named.length) {
    const suggestion = named.includes(answers.mainCause) ? answers.mainCause : named[0];
    return { status: 'clear', suggestion, alternatives: named.filter(cause => cause !== suggestion) };
  }
  if (JEV_CAUSES.every(cause => answers.causes[cause] < no)) {
    if (answers.anyProblem < no) return { status: 'clear', suggestion: 'none', alternatives: [] };
    if (answers.anyProblem > yes) return { status: 'clear', suggestion: 'other', alternatives: [] };
  }
  return { status: 'unclear', suggestion: null, alternatives: [] };
}

/* UC-S1 window check: one judgment every this much active focus time. The panel shows at most this many of the newest rows. */
export const JEV_WINDOW_LIMITS = { everyMs: 5 * 60000, shown: 200 } as const;

/* A Score answer: the probability-weighted level (0 = unrelated … 3 = the work itself), how concentrated the
   distribution is (0–1, from TypeSafe), and each level's probability in level order. */
export interface JevScore { score: number; confidence: number; probabilities: number[] }

/* One window check (schema 12). It is kept apart from the user's records: no insight, backup or agent tool reads it,
   so its quality can be judged before it joins the analysis. No decision is made from it yet. */
export interface WindowJudgment {
  id: string; sessionId: string; at: string; activeOffsetMs: number;
  model: string; questionSet: string;
  /* skipped: no request was sent; error: the request failed, which is never read as "not aligned". */
  status: 'ok' | 'skipped' | 'error';
  reason?: 'own-window' | 'no-window' | 'private-window' | 'no-title';
  error?: string;
  app: string; title: string;
  image: 'sent' | 'unusable' | 'off';
  area: JevScore | null; plan: JevScore | null; readable: number | null;
  inputTokens: number | null;
}
