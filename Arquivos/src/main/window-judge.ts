import { desktopCapturer } from 'electron';
import { randomUUID } from 'node:crypto';
import type { FocusSession, JevWindowCheck, TimerSnapshot } from '../shared/types';
import { JEV_WINDOW_LIMITS, type WindowJudgment } from '../shared/jev-decisions';
import type { ForegroundWindow } from './behaviour';
import { askJev, JevError } from './jev-client';
import { JEV_MODEL, WINDOW_QUESTION_SET, readWindowAlignment, windowRequest, type WindowContext, type WindowView } from './jev-questions';

/** Runtime-only schedule of the window check: one judgment for each JEV_WINDOW_LIMITS.everyMs of active focus time.
    Active time comes from the timer snapshot; pause, breaks and Offline sessions do not count. The first judgment waits
    one full interval from the moment the check is on, also when it is turned on mid-session. */
export class WindowJudgeScheduler {
  private sessionId: string | null = null;
  private nextAt = 0;
  private armed = false;
  constructor(private everyMs: number = JEV_WINDOW_LIMITS.everyMs) {}
  /** Returns the active-time offset of a judgment that is due now, or null. */
  tick(snapshot: TimerSnapshot, session: FocusSession | null, enabled: boolean): number | null {
    if (snapshot.sessionId !== this.sessionId) { this.sessionId = snapshot.sessionId; this.armed = false; }
    if (!enabled) { this.armed = false; return null; }
    if (!this.armed && snapshot.sessionId) { this.armed = true; this.nextAt = snapshot.elapsedMs + this.everyMs; }
    const eligible = snapshot.mode === 'focus' && snapshot.running && !!session && session.id === snapshot.sessionId && session.activityMode !== 'Offline';
    if (!eligible || snapshot.elapsedMs < this.nextAt) return null;
    this.nextAt = snapshot.elapsedMs + this.everyMs;
    return snapshot.elapsedMs;
  }
}

/* Private browsing windows are never judged and their titles are never kept. */
const PRIVATE_WINDOW = /InPrivate|Incognito|Private Browsing|Private Window|\(Private\)|Navegação (privada|anônima)|Janela anônima/i;

/* TypeSafe image limits: each side 280–1568 px. A capture outside them after scaling is not sent. */
const IMAGE_SIDES = { min: 280, max: 1568, capture: 1280 } as const;

/* A capture of one window as baseline JPEG in base64, or null when Windows gives no usable picture of it
   (a protected or minimized window is blank, and a very thin window cannot be scaled into the limits). */
async function captureWindow(hwnd: string): Promise<string | null> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: IMAGE_SIDES.capture, height: IMAGE_SIDES.capture }, fetchWindowIcons: false });
  const image = sources.find(source => source.id === `window:${hwnd}:0`)?.thumbnail;
  if (!image || image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const scale = Math.min(Math.max(1, IMAGE_SIDES.min / Math.min(width, height)), IMAGE_SIDES.max / Math.max(width, height));
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
  if ([size.width, size.height].some(side => side < IMAGE_SIDES.min || side > IMAGE_SIDES.max)) return null;
  const sized = scale === 1 ? image : image.resize({ ...size, quality: 'good' });
  // A picture of one flat colour shows nothing; sample the BGRA pixels for any contrast.
  const pixels = sized.toBitmap();
  let low = 255, high = 0;
  for (let index = 0; index < pixels.length; index += 4 * 97) { const level = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3; low = Math.min(low, level); high = Math.max(high, level); }
  if (high - low < 8) return null;
  return sized.toJPEG(70).toString('base64');
}

export interface WindowJudgeInput {
  key: string; sessionId: string; activeOffsetMs: number; mode: Exclude<JevWindowCheck, 'off'>; context: WindowContext;
  readWindow: () => Promise<ForegroundWindow>;
}

/* Reads the foreground window, captures it when asked, and asks Jev. Every outcome is a row: a window that is not judged
   is 'skipped', and a failure is 'error', never a low score. rejectedKey tells the caller to stop until a new key is saved. */
export async function judgeWindow(input: WindowJudgeInput): Promise<{ judgment: WindowJudgment; rejectedKey: boolean }> {
  const judgment: WindowJudgment = { id: randomUUID(), sessionId: input.sessionId, at: new Date().toISOString(), activeOffsetMs: input.activeOffsetMs,
    model: JEV_MODEL, questionSet: WINDOW_QUESTION_SET, status: 'skipped', app: '', title: '', image: 'off', area: null, plan: null, readable: null, inputTokens: null };
  try {
    const window = await input.readWindow();
    if (window.kind === 'none') return { judgment: { ...judgment, reason: 'no-window' }, rejectedKey: false };
    if (window.kind === 'own') return { judgment: { ...judgment, reason: 'own-window', app: 'Focus Guide' }, rejectedKey: false };
    if (PRIVATE_WINDOW.test(window.title)) return { judgment: { ...judgment, reason: 'private-window', app: window.app }, rejectedKey: false };
    judgment.app = window.app; judgment.title = window.title;
    const view: WindowView = { app: window.app, title: window.title };
    if (input.mode === 'title-image') {
      const base64 = await captureWindow(window.hwnd).catch(() => null);
      judgment.image = base64 ? 'sent' : 'unusable';
      if (base64) view.image = { ref: randomUUID(), base64 };
    }
    if (!view.title && !view.image) return { judgment: { ...judgment, reason: 'no-title' }, rejectedKey: false };
    const request = windowRequest(input.context, view), hasPlan = 'plan_alignment' in request.questions;
    const { answers, inputTokens } = await askJev(input.key, WINDOW_QUESTION_SET, request);
    return { judgment: { ...judgment, ...readWindowAlignment(answers, hasPlan), status: 'ok', inputTokens }, rejectedKey: false };
  } catch (error) {
    return { judgment: { ...judgment, status: 'error', error: error instanceof Error ? error.message : String(error) }, rejectedKey: error instanceof JevError && error.status === 401 };
  }
}
