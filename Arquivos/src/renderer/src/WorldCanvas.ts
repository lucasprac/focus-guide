import { dateLocale } from '../../shared/i18n';
import { areaRadius, coreRadius, goalRadius, type MapArea, type MapGoal, type WorldMap } from './world-map';

/* Canvas 2D renderer of the Neural World overview. It owns its animation loop, so motion never renders React.
   Life comes from records: each finished session is a mote that orbits its goal or area, recent time sends pulses from
   you to where you spent it, and a running session streams light to its goal. Nothing here measures or changes time. */
export type WorldSelection = { kind: 'core' | 'area' | 'goal'; id: string };
export type WorldHit = WorldSelection | { kind: 'gem'; id: string };
export interface WorldGem { id: string; title: string }
export interface WorldFrame {
  map: WorldMap; color: string; theme: 'light' | 'dark'; motion: boolean; selected: WorldSelection | null;
  gems: WorldGem[]; horizon: number;
  describe: (hit: WorldHit) => { title: string; detail: string };
}
export interface WorldCallbacks {
  onSelect: (selection: WorldSelection | null) => void; onCollect: (id: string) => void; onReplay: (active: boolean) => void;
  tooltip: HTMLElement; hud: HTMLElement;
}
type Point = { x: number; y: number };
type Pulse = { from: Point; via: Point; to: Point | null; color: string; start: number; duration: number; size: number };
type Burst = { x: number; y: number; vx: number; vy: number; start: number; color: string };
type Mote = { owner: string; base: number; orbit: number; phase: number; speed: number; size: number; recent: boolean };
type Hit = { hit: WorldHit; x: number; y: number; r: number };

const TAU = Math.PI * 2, WEEK = 7 * 86400000, REPLAY_MS = 9000;
const hexCache = new Map<string, [number, number, number]>();
function rgba(hex: string, alpha: number): string {
  let rgb = hexCache.get(hex);
  if (!rgb) { const n = parseInt(hex.slice(1, 7), 16); rgb = [n >> 16 & 255, n >> 8 & 255, n & 255]; hexCache.set(hex, rgb); }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
// A gentle curve between two points; bend is relative to their distance.
function curve(a: Point, b: Point, t: number, bend = .12): Point {
  const c = { x: (a.x + b.x) / 2 - (b.y - a.y) * bend, y: (a.y + b.y) / 2 + (b.x - a.x) * bend }, u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
function seeded(seed: string): () => number {
  let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function createWorldCanvas(canvas: HTMLCanvasElement, callbacks: WorldCallbacks) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available.');
  const ctx = context;
  let frame: WorldFrame | null = null, raf = 0, last = 0, disposed = false, width = 1, height = 1, dpr = 1;
  let ink = { text: '#24243d', muted: '#61647b', panel: '#ffffff', line: '#e0dff0' }, inkTheme = '';
  let motes: Mote[] = [], motesFor: WorldMap | null = null, stars: Array<Point & { r: number; phase: number }> = [];
  let pulses: Pulse[] = [], bursts: Burst[] = [], hits: Hit[] = [], hover: Hit | null = null;
  const camera = { x: 0, y: 0, zoom: 1 }, target = { x: 0, y: 0, zoom: 1 };
  // Half the size of the drawn map in world units, so the overview fills the stage at any aspect ratio.
  let extent = { x: 1, y: 1 };
  const spawnClock = new Map<string, number>();
  let replay: { start: number; cursor: number; areas: Map<string, number>; goals: Map<string, number>; total: number } | null = null;
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  const star = seeded('sky');
  stars = Array.from({ length: 90 }, () => ({ x: star() * 2.8 - 1.4, y: star() * 2.8 - 1.4, r: .4 + star() * 1.1, phase: star() * TAU }));

  const unit = () => Math.min(width / (2 * extent.x), height / (2 * extent.y)) * camera.zoom;
  const screen = (p: Point): Point => ({ x: width / 2 + (p.x - camera.x) * unit(), y: height / 2 + (p.y - camera.y) * unit() });
  const world = (x: number, y: number): Point => ({ x: (x - width / 2) / unit() + camera.x, y: (y - height / 2) / unit() + camera.y });
  const core: Point = { x: 0, y: 0 };

  function readInk() {
    const style = getComputedStyle(canvas), read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    ink = { text: read('--text', ink.text), muted: read('--muted', ink.muted), panel: read('--panel', ink.panel), line: read('--line', ink.line) };
  }
  function buildMotes(map: WorldMap) {
    motes = []; const now = Date.now(), perOwner = new Map<string, number>();
    for (let i = map.sparks.length - 1; i >= 0; i--) {
      const spark = map.sparks[i], owner = spark.goalId ? `g:${spark.goalId}` : `a:${spark.areaId}`, n = perOwner.get(owner) ?? 0;
      if (n >= (spark.goalId ? 16 : 28)) continue;
      perOwner.set(owner, n + 1);
      const random = seeded(`${owner}${i}`);
      motes.push({ owner, base: spark.at, orbit: .012 + (n % 4) * .009 + random() * .006, phase: random() * TAU, speed: (.12 + random() * .22) * (random() < .5 ? -1 : 1), size: 1 + Math.min(2.2, spark.minutes / 40), recent: now - spark.at < WEEK });
    }
    let x = .32, y = .32;
    for (const area of map.areas) {
      x = Math.max(x, Math.abs(area.x) + .17); y = Math.max(y, Math.abs(area.y) + .17);
      for (const goal of area.goals) { x = Math.max(x, Math.abs(goal.x) + .09); y = Math.max(y, Math.abs(goal.y) + .11); }
    }
    extent = { x: x * 1.06, y: y * 1.08 };
    motesFor = map;
  }
  // Minutes at the replay moment, or the real totals outside a replay.
  const areaMinutes = (area: MapArea) => replay ? replay.areas.get(area.id) ?? 0 : area.minutes;
  const goalMinutes = (goal: MapGoal) => replay ? replay.goals.get(goal.goal.id) ?? 0 : goal.goal.totalMinutes;
  const replayAt = (now: number) => {
    if (!replay || !frame?.map.firstAt) return Infinity;
    const t = ease(Math.min(1, (now - replay.start) / REPLAY_MS));
    return frame.map.firstAt - 86400000 + (Date.now() - frame.map.firstAt + 86400000) * t;
  };
  const born = (createdAt: number, minutes: number, at: number) => minutes > 0 || createdAt <= at ? 1 : 0;

  function pulse(area: MapArea, goal: MapGoal | null, now: number, size = 1, duration = 2400) {
    pulses.push({ from: core, via: area, to: goal, color: area.color, start: now, duration, size });
    if (pulses.length > 160) pulses.shift();
  }
  function advanceReplay(now: number) {
    if (!replay || !frame) return;
    const at = replayAt(now), map = frame.map; let spawned = 0;
    while (replay.cursor < map.sparks.length && map.sparks[replay.cursor].at <= at) {
      const spark = map.sparks[replay.cursor++];
      replay.areas.set(spark.areaId, (replay.areas.get(spark.areaId) ?? 0) + spark.minutes);
      if (spark.goalId) replay.goals.set(spark.goalId, (replay.goals.get(spark.goalId) ?? 0) + spark.minutes);
      replay.total += spark.minutes;
      const area = map.areas.find(a => a.id === spark.areaId);
      if (area && spawned++ < 6) pulse(area, area.goals.find(g => g.goal.id === spark.goalId) ?? null, now, 1 + Math.min(1.5, spark.minutes / 60), 1300);
    }
    callbacks.hud.textContent = new Date(Math.min(at, Date.now())).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    if (now - replay.start >= REPLAY_MS + 1400) stopReplay();
  }
  function spawnLife(now: number, elapsed: number) {
    if (!frame || replay) return;
    const map = frame.map;
    for (const area of map.areas) {
      const targets: Array<[string, MapGoal | null, number]> = [[area.id, null, Math.max(0, area.minutes28 - area.goals.reduce((s, g) => s + g.goal.minutes28, 0))], ...area.goals.map((g): [string, MapGoal, number] => [g.goal.id, g, g.goal.minutes28])];
      for (const [id, goal, minutes] of targets) {
        const live = map.live?.areaId === area.id && (map.live.goalId ?? null) === (goal?.goal.id ?? null);
        // Recent time sets the pulse rate: one pulse every few seconds for a busy month, none for an idle one.
        const rate = live ? 1.6 : minutes > 0 ? .05 + Math.min(.35, minutes / 900) : 0;
        if (!rate) continue;
        const clock = (spawnClock.get(id) ?? Math.random()) + elapsed * rate;
        if (clock >= 1) pulse(area, goal, now, live ? 1.4 : 1, live ? 1600 : 2600);
        spawnClock.set(id, clock % 1);
      }
    }
  }

  function glow(p: Point, radius: number, color: string, alpha: number) {
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gradient.addColorStop(0, rgba(color, alpha)); gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
  }
  function link(a: Point, b: Point, color: string, alpha: number, lineWidth: number, bend = .12) {
    const steps = 18; ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const p = screen(curve(a, b, i / steps, bend)); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = lineWidth * dpr; ctx.stroke();
  }
  function label(text: string, p: Point, color: string, size = 12, weight = 500) {
    ctx.font = `${weight} ${size * dpr}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 * dpr; ctx.strokeStyle = rgba(ink.panel.startsWith('#') ? ink.panel : '#ffffff', .85); ctx.strokeText(text, p.x, p.y);
    ctx.fillStyle = color; ctx.fillText(text, p.x, p.y);
  }
  const trim = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

  function draw(now: number) {
    if (!frame) return;
    const { map, color, motion, selected } = frame, dark = frame.theme === 'dark', time = motion ? now / 1000 : 0, at = replayAt(now);
    if (inkTheme !== frame.theme) { readInk(); inkTheme = frame.theme; }
    if (motesFor !== map) buildMotes(map);
    hits = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = unit(), centre = screen(core);
    // Sky: palette haze and twinkling dust.
    glow(centre, Math.max(width, height) * .75, color, dark ? .1 : .07);
    for (const s of stars) {
      const p = screen({ x: s.x * .6 + camera.x * .4, y: s.y * .6 + camera.y * .4 });
      ctx.fillStyle = rgba(color, (dark ? .35 : .28) * (.55 + .45 * Math.sin(time * .8 + s.phase)));
      ctx.beginPath(); ctx.arc(p.x, p.y, s.r * dpr, 0, TAU); ctx.fill();
    }
    const muted = (id: string) => selected && selected.kind !== 'core' && selected.id !== id;
    // Trunks: you → area → goal. Recent time makes a trunk thicker and brighter.
    for (const area of map.areas) {
      const alive = born(area.createdAt, areaMinutes(area), at); if (!alive) continue;
      const recent = Math.min(1, area.minutes28 / 600), dim = muted(area.id) && !area.goals.some(g => g.goal.id === selected?.id) ? .35 : 1;
      link(core, area, area.color, (.16 + .3 * recent) * dim, 1 + recent * 2.5, .08);
      for (const goal of area.goals) if (born(goal.createdAt, goalMinutes(goal), at)) link(area, goal, area.color, (.14 + .3 * Math.min(1, goal.goal.minutes28 / 300)) * (muted(goal.goal.id) && selected?.id !== area.id ? .35 : 1), 1 + Math.min(2, goal.goal.minutes28 / 200), .2);
    }
    // Areas: a nebula whose size follows all time spent there; motes are its sessions without a goal.
    for (const area of map.areas) {
      const minutes = areaMinutes(area), alive = born(area.createdAt, minutes, at); if (!alive) continue;
      const p = screen(area), r = areaRadius(minutes) * px * (1 + .03 * Math.sin(time * .9 + area.angle * 3)), dim = muted(area.id) ? .45 : 1;
      glow(p, r * 1.6, area.color, (dark ? .3 : .22) * dim);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.strokeStyle = rgba(area.color, .45 * dim); ctx.lineWidth = 1.2 * dpr; ctx.setLineDash(minutes ? [] : [4 * dpr, 5 * dpr]); ctx.stroke(); ctx.setLineDash([]);
      hits.push({ hit: { kind: 'area', id: area.id }, x: p.x, y: p.y, r });
      label(trim(area.name, 22), p, dim < 1 ? ink.muted : ink.text, 12, 600);
    }
    // Motes: one per recent session, orbiting the place it went to.
    for (const mote of motes) {
      if (replay && mote.base > at) continue;
      const [kind, id] = [mote.owner[0], mote.owner.slice(2)];
      const area = kind === 'a' ? map.areas.find(a => a.id === id) : map.areas.find(a => a.goals.some(g => g.goal.id === id));
      if (!area) continue;
      const goal = kind === 'g' ? area.goals.find(g => g.goal.id === id)! : null;
      const centrePoint: Point = goal ?? area, radius = goal ? goalRadius(goalMinutes(goal)) + .016 + mote.orbit * .6 : areaRadius(areaMinutes(area)) * .55 + mote.orbit * 1.4;
      const angle = mote.phase + time * mote.speed, p = screen({ x: centrePoint.x + Math.cos(angle) * radius, y: centrePoint.y + Math.sin(angle) * radius });
      ctx.fillStyle = rgba(area.color, (mote.recent ? .95 : .5) * (muted(goal?.goal.id ?? area.id) ? .4 : 1));
      ctx.beginPath(); ctx.arc(p.x, p.y, mote.size * dpr * (mote.recent ? 1.15 : .9), 0, TAU); ctx.fill();
    }
    // Goals: a cell sized by its focus time, with its roadmap as beads around it.
    for (const area of map.areas) for (const goal of area.goals) {
      const minutes = goalMinutes(goal); if (!born(goal.createdAt, minutes, at)) continue;
      const g = goal.goal, p = screen(goal), r = goalRadius(minutes) * px, dim = muted(g.id) ? .4 : g.status === 'paused' ? .55 : 1;
      if (g.status === 'achieved') { ctx.beginPath(); ctx.arc(p.x, p.y, r + 9 * dpr, 0, TAU); ctx.strokeStyle = rgba('#e8c46a', .8 * dim); ctx.lineWidth = 1.6 * dpr; ctx.stroke(); glow(p, r * 2.6, '#e8c46a', .25 * dim); }
      glow(p, r * 2.2, area.color, .35 * dim);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fillStyle = rgba(area.color, (g.status === 'draft' ? .35 : .88) * dim); ctx.fill();
      ctx.strokeStyle = rgba(area.color, dim); ctx.lineWidth = 1.2 * dpr; ctx.setLineDash(g.status === 'draft' ? [3 * dpr, 3 * dpr] : []); ctx.stroke(); ctx.setLineDash([]);
      // Progress toward a measured target fills an inner arc.
      if (g.progress) { ctx.beginPath(); ctx.arc(p.x, p.y, r * .55, -Math.PI / 2, -Math.PI / 2 + TAU * g.progress.fraction); ctx.strokeStyle = rgba(ink.panel.startsWith('#') ? ink.panel : '#ffffff', .9 * dim); ctx.lineWidth = 2 * dpr; ctx.stroke(); }
      for (const bead of goal.steps) {
        const b = { x: p.x + Math.cos(bead.angle) * (r + 6 * dpr), y: p.y + Math.sin(bead.angle) * (r + 6 * dpr) };
        const pulseScale = bead.step.next && motion ? 1 + .35 * Math.sin(time * 3) : 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, (bead.step.completed ? 2.4 : bead.step.next ? 2.8 * pulseScale : 1.8) * dpr, 0, TAU);
        if (bead.step.completed || bead.step.next) { ctx.fillStyle = rgba(area.color, dim); ctx.fill(); } else { ctx.strokeStyle = rgba(area.color, .6 * dim); ctx.lineWidth = 1 * dpr; ctx.stroke(); }
      }
      hits.push({ hit: { kind: 'goal', id: g.id }, x: p.x, y: p.y, r: r + 9 * dpr });
      if (selected?.id === g.id || camera.zoom >= 1.6) label(trim(g.title, 26), { x: p.x, y: p.y + r + 18 * dpr }, ink.text, 11, 500);
    }
    // You: the core grows with all your time; its ring shows the way to the next horizon.
    const coreMinutes = replay ? replay.total : map.totalMinutes, cr = coreRadius(coreMinutes) * px * (1 + .04 * Math.sin(time * 1.3));
    glow(centre, cr * 3, color, dark ? .45 : .35);
    const body = ctx.createRadialGradient(centre.x - cr * .3, centre.y - cr * .3, cr * .1, centre.x, centre.y, cr);
    body.addColorStop(0, rgba('#ffffff', .95)); body.addColorStop(.35, rgba(color, .95)); body.addColorStop(1, rgba(color, .75));
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(centre.x, centre.y, cr, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(centre.x, centre.y, cr + 7 * dpr, 0, TAU); ctx.strokeStyle = rgba(color, .2); ctx.lineWidth = 3 * dpr; ctx.stroke();
    ctx.beginPath(); ctx.arc(centre.x, centre.y, cr + 7 * dpr, -Math.PI / 2, -Math.PI / 2 + TAU * frame.horizon); ctx.strokeStyle = rgba(color, .95); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    hits.push({ hit: { kind: 'core', id: 'core' }, x: centre.x, y: centre.y, r: cr + 8 * dpr });
    // Pulses travel from you to where your time went.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    pulses = pulses.filter(p => now - p.start < p.duration);
    for (const p of pulses) {
      const t = (now - p.start) / p.duration, split = p.to ? .6 : 1;
      const point = t < split ? curve(p.from, p.via, t / split, .08) : curve(p.via, p.to!, (t - split) / (1 - split), .2);
      const s = screen(point), fade = Math.sin(Math.PI * t);
      glow(s, 7 * dpr * p.size, p.color, .55 * fade); ctx.fillStyle = rgba('#ffffff', .8 * fade); ctx.beginPath(); ctx.arc(s.x, s.y, 1.4 * dpr * p.size, 0, TAU); ctx.fill();
    }
    bursts = bursts.filter(b => now - b.start < 900);
    for (const b of bursts) { const t = (now - b.start) / 900; ctx.fillStyle = rgba(b.color, 1 - t); ctx.beginPath(); ctx.arc(b.x + b.vx * t * 60 * dpr, b.y + b.vy * t * 60 * dpr, 2.2 * dpr * (1 - t * .6), 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    // Earned achievements wait in orbit until you collect them.
    if (!replay) frame.gems.slice(0, 8).forEach((gem, i, all) => {
      const angle = -Math.PI / 2 + i / all.length * TAU + time * .25, distance = cr / px + .09;
      const g = screen({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }), s = 6 * dpr * (1 + .12 * Math.sin(time * 4 + i));
      glow(g, s * 3.2, '#e8c46a', .55);
      ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * .75, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * .75, g.y); ctx.closePath();
      ctx.fillStyle = rgba('#f4d98b', .95); ctx.fill(); ctx.strokeStyle = rgba('#b8892c', .9); ctx.lineWidth = 1 * dpr; ctx.stroke();
      hits.push({ hit: { kind: 'gem', id: gem.id }, x: g.x, y: g.y, r: s * 1.8 });
    });
    // Selection and hover rings.
    const ring = (hit: Hit | undefined, alpha: number) => { if (!hit) return; ctx.beginPath(); ctx.arc(hit.x, hit.y, hit.r + 4 * dpr, 0, TAU); ctx.strokeStyle = rgba(ink.text.startsWith('#') ? ink.text : '#24243d', alpha); ctx.lineWidth = 1.4 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]); };
    if (selected) ring(hits.find(h => h.hit.kind === selected.kind && h.hit.id === selected.id), .7);
    if (hover) ring(hits.find(h => h.hit.kind === hover!.hit.kind && h.hit.id === hover!.hit.id), .35);
  }

  function loop(now: number) {
    raf = 0;
    if (disposed || !frame) return;
    const animating = frame.motion || replay || bursts.length || Math.abs(camera.zoom - target.zoom) > .002 || Math.hypot(camera.x - target.x, camera.y - target.y) > .001;
    if (frame.motion && last && now - last < 32 && animating) { raf = requestAnimationFrame(loop); return; }
    const elapsed = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    const k = frame.motion ? 1 - Math.exp(-elapsed * 7) : 1;
    camera.x += (target.x - camera.x) * k; camera.y += (target.y - camera.y) * k; camera.zoom += (target.zoom - camera.zoom) * k;
    advanceReplay(now);
    if (frame.motion) spawnLife(now, elapsed);
    draw(now);
    canvas.dataset.frames = String(Number(canvas.dataset.frames ?? 0) + 1);
    if (animating) raf = requestAnimationFrame(loop); else last = 0;
  }
  const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };

  function resize() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, rect.width * dpr); height = Math.max(1, rect.height * dpr);
    canvas.width = Math.round(width); canvas.height = Math.round(height); request();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);

  const local = (event: PointerEvent | WheelEvent) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr }; };
  const pick = (x: number, y: number) => {
    const order = ['gem', 'goal', 'core', 'area'];
    return hits.filter(h => Math.hypot(h.x - x, h.y - y) <= h.r).sort((a, b) => order.indexOf(a.hit.kind) - order.indexOf(b.hit.kind) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] ?? null;
  };
  function showTooltip(hit: Hit | null) {
    const tip = callbacks.tooltip;
    if (!hit || !frame) { tip.hidden = true; return; }
    const text = frame.describe(hit.hit), title = document.createElement('strong'), detail = document.createElement('span');
    title.textContent = text.title; detail.textContent = text.detail; tip.replaceChildren(title, detail);
    tip.hidden = false; tip.style.transform = `translate(${(hit.x / dpr).toFixed(1)}px, ${((hit.y - hit.r) / dpr).toFixed(1)}px)`;
  }
  function onDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }; canvas.setPointerCapture(event.pointerId);
  }
  function onMove(event: PointerEvent) {
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true; canvas.classList.add('is-dragging');
      target.x = camera.x -= dx * dpr / unit(); target.y = camera.y -= dy * dpr / unit();
      drag.x = event.clientX; drag.y = event.clientY; showTooltip(null); request(); return;
    }
    const p = local(event), found = pick(p.x, p.y);
    if (found?.hit.id !== hover?.hit.id || found?.hit.kind !== hover?.hit.kind) { hover = found; showTooltip(found); canvas.style.cursor = found ? 'pointer' : ''; request(); }
  }
  function onUp(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved; drag = null; canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (moved) return;
    const p = local(event), found = pick(p.x, p.y);
    if (found?.hit.kind === 'gem') {
      const random = seeded(found.hit.id);
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; bursts.push({ x: found.x, y: found.y, vx: Math.cos(a) * (.6 + random()), vy: Math.sin(a) * (.6 + random()), start: performance.now(), color: i % 2 ? '#f4d98b' : frame?.color ?? '#ffffff' }); }
      callbacks.onCollect(found.hit.id); request();
    } else callbacks.onSelect(found ? found.hit as WorldSelection : null);
  }
  function onLeave() { if (!drag) { hover = null; showTooltip(null); canvas.style.cursor = ''; request(); } }
  // Plain scrolling keeps scrolling the page; Ctrl or ⌘ with the wheel zooms the map.
  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const p = local(event), before = world(p.x, p.y);
    camera.zoom = target.zoom = Math.max(.7, Math.min(3, camera.zoom * Math.exp(-event.deltaY * .0015)));
    const after = world(p.x, p.y); target.x = camera.x += before.x - after.x; target.y = camera.y += before.y - after.y; request();
  }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('wheel', onWheel, { passive: false });

  function stopReplay() {
    if (!replay) return;
    replay = null; callbacks.hud.textContent = ''; callbacks.onReplay(false); request();
  }
  function position(selection: WorldSelection): Point | null {
    if (!frame || selection.kind === 'core') return core;
    for (const area of frame.map.areas) {
      if (selection.kind === 'area' && area.id === selection.id) return area;
      const goal = area.goals.find(g => g.goal.id === selection.id); if (goal) return goal;
    }
    return null;
  }
  return {
    update(next: WorldFrame) { frame = next; if (inkTheme && inkTheme !== next.theme) inkTheme = ''; request(); },
    replay() {
      if (!frame?.map.firstAt) return;
      replay = { start: performance.now(), cursor: 0, areas: new Map(), goals: new Map(), total: 0 }; pulses = [];
      Object.assign(target, { x: 0, y: 0, zoom: 1 }); callbacks.onReplay(true); request();
    },
    stopReplay,
    zoom(factor: number) { target.zoom = Math.max(.7, Math.min(3, target.zoom * factor)); if (!frame?.motion) camera.zoom = target.zoom; request(); },
    pan(dx: number, dy: number) { target.x += dx / camera.zoom; target.y += dy / camera.zoom; if (!frame?.motion) Object.assign(camera, { x: target.x, y: target.y }); request(); },
    focus(selection: WorldSelection | null) {
      const p = selection && selection.kind !== 'core' ? position(selection) : null;
      Object.assign(target, p ? { x: p.x, y: p.y, zoom: selection!.kind === 'goal' ? 2 : 1.55 } : { x: 0, y: 0, zoom: 1 });
      if (!frame?.motion) Object.assign(camera, target);
      request();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
    }
  };
}
export type WorldCanvas = ReturnType<typeof createWorldCanvas>;
