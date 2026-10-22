import { stepWindow, WORLD_GOAL_LIMIT, type WorldGoal, type WorldStep } from '../../shared/goal-world';

/* World-unit layout shared by the WebGL scene and the SVG fallback. It has no Three.js import, so the fallback
   stays in the main chunk without the 3D library. Positions come from identities, never from rankings. */
export type Vec3 = { x: number; y: number; z: number };
export interface NeuronLayout {
  goal: WorldGoal; soma: Vec3; radius: number; direction: Vec3;
  steps: WorldStep[]; synapses: Vec3[]; hiddenBefore: number; hiddenAfter: number;
  dendrites: Vec3[][]; sparks: Array<{ point: Vec3; small: boolean }>; focus: Vec3;
}
export interface AreaLayout { id: string; color: string; center: Vec3 }
export interface WorldLayout { neurons: NeuronLayout[]; areas: AreaLayout[]; achievedRadius: number | null }

export const ACHIEVED_RADIUS = 3.1, ACHIEVED_HEIGHT = -.7;
/* Long roadmaps pack their synapses closer, so every axon stays inside the scene. */
const stepSpacing = (count: number) => Math.min(.17, 1.45 / Math.max(1, count - 1));

export function seedFor(id: string) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}
const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => ({ x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale });
/* Soma size follows total focus time on a log scale, so a new goal stays visible and a long one stays bounded. */
export const somaRadius = (minutes: number) => Math.min(.22, .08 + .04 * Math.log2(1 + Math.max(0, minutes) / 30));

function neuron(goal: WorldGoal, angle: number, distance: number, height: number, achieved: boolean): NeuronLayout {
  const seed = seedFor(goal.id), radius = somaRadius(goal.totalMinutes) * (achieved ? .8 : 1);
  const direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) }, tangent = { x: -Math.sin(angle), y: 0, z: Math.cos(angle) };
  const soma = { x: direction.x * distance, y: height, z: direction.z * distance };
  const { start, end } = achieved ? { start: 0, end: 0 } : stepWindow(goal), steps = goal.steps.slice(start, end);
  const curl = seed & 1 ? 1 : -1, spacing = stepSpacing(steps.length);
  // The axon leaves the soma outward and bends a little to one side, with a slight vertical wave.
  const axonPoint = (i: number) => {
    const u = i / 11;
    return add(add(add(soma, direction, radius + .22 + i * spacing), tangent, curl * .32 * u * u), { x: 0, y: 1, z: 0 }, .06 * Math.sin(i * .9 + seed % 7));
  };
  const synapses = steps.map((_, i) => axonPoint(i));
  // Short dendrites leave the side opposite the axon. Their count and shape come from the seed only.
  const branches = 3 + seed % 3;
  const dendrites = achieved ? [] : Array.from({ length: branches }, (_, d) => {
    const spread = (d / (branches - 1) - .5) * 1.6 + (seed >>> (d + 2) & 7) / 20, back = angle + Math.PI + spread, lift = ((seed >>> (d * 3)) % 9 - 4) / 14;
    const way = { x: Math.cos(back), y: lift, z: Math.sin(back) };
    return [0, 1, 2].map(k => add(add(soma, way, radius * .9 + k * .13), tangent, k * k * .02 * curl));
  });
  // Recorded actions of the last 28 days: one spark each, around the soma. A smaller version gives a smaller spark.
  const count = Math.min(16, goal.done) + Math.min(12, goal.smaller);
  const sparks = Array.from({ length: count }, (_, i) => {
    const t = (i + .5) / Math.max(1, count), phi = Math.acos(1 - 2 * t), theta = i * 2.399963 + seed % 100 / 16, r = radius * 1.9 + .04 + (seed >>> i % 16 & 3) * .02;
    return { point: add(soma, { x: Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta) }, r), small: i >= Math.min(16, goal.done) };
  });
  const last = synapses.at(-1) ?? add(soma, direction, radius + .3);
  return { goal, soma, radius, direction, steps, synapses, hiddenBefore: start, hiddenAfter: goal.steps.length - end, dendrites, sparks, focus: { x: (soma.x + last.x) / 2, y: (soma.y + last.y) / 2, z: (soma.z + last.z) / 2 } };
}

export function layoutWorld(goals: WorldGoal[], areaColors: Map<string, string>): WorldLayout {
  const shown = goals.slice(0, WORLD_GOAL_LIMIT);
  const living = shown.filter(g => g.status !== 'achieved'), achieved = shown.filter(g => g.status === 'achieved').sort((a, b) => a.id.localeCompare(b.id));
  const areaIds = [...new Set(living.map(g => g.fieldId))].sort(), sector = Math.PI * 2 / Math.max(1, areaIds.length);
  const neurons: NeuronLayout[] = [], areas: AreaLayout[] = [];
  areaIds.forEach((areaId, k) => {
    const members = living.filter(g => g.fieldId === areaId).sort((a, b) => a.id.localeCompare(b.id));
    const center = k * sector + .4, spread = Math.min(sector * .75, .62 * (members.length - 1));
    members.forEach((goal, j) => {
      const angle = center + (members.length > 1 ? (j / (members.length - 1) - .5) * spread : 0);
      neurons.push(neuron(goal, angle, 1.05 + (j % 2) * .32, (seedFor(goal.id) % 1000 / 1000 - .5) * .7, false));
    });
    areas.push({ id: areaId, color: areaColors.get(areaId) ?? '#a99af7', center: { x: Math.cos(center) * 1.75, y: 0, z: Math.sin(center) * 1.75 } });
  });
  achieved.forEach((goal, j) => neurons.push(neuron(goal, j / achieved.length * Math.PI * 2 + .2, ACHIEVED_RADIUS, ACHIEVED_HEIGHT, true)));
  return { neurons, areas, achievedRadius: achieved.length ? ACHIEVED_RADIUS : null };
}
