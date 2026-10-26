import * as THREE from 'three';
import type { WorldGoal } from '../../shared/goal-world';
import { layoutWorld, seedFor, ACHIEVED_HEIGHT, type NeuronLayout, type Vec3 } from './goal-world-layout';

// Neural World: one neuron per goal. The soma grows with focus time, roadmap steps are synapses along the
// axon, sparks are recorded actions and an arc shows measured progress. The scene is display only.
export interface GoalWorldView { yaw: number; pitch: number; zoom: number }
export interface GoalWorldFrame {
  view: GoalWorldView; focusId: string | null; selectedId: string | null; selectedStepId: string | null;
  color: string; theme: 'light' | 'dark'; time: number; elapsed: number; motion: boolean; pointScale: number;
}
export interface GoalWorldPick { goalId: string; stepId?: string }
export interface GoalWorldScene {
  group: THREE.Group; lights: THREE.Light[]; targets: THREE.Object3D[];
  pick: (raycaster: THREE.Raycaster) => GoalWorldPick | null;
  /* Moves the camera and returns true while a transition still needs frames. */
  update: (frame: GoalWorldFrame, camera: THREE.PerspectiveCamera) => boolean;
  screen: (camera: THREE.PerspectiveCamera, width: number, height: number) => Array<{ id: string; x: number; y: number }>;
}

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const glowVertex = `
attribute float size; attribute float strength; attribute float pulse; attribute vec3 tint;
uniform float time; uniform float pointScale;
varying vec3 vTint; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float beat = pulse > 0.0 ? 0.72 + 0.28 * sin(time * 2.1 + pulse * 6.2832) : 1.0;
  gl_PointSize = min(900.0, size * beat * pointScale / max(0.1, -mv.z));
  vTint = tint; vAlpha = strength * beat;
  gl_Position = projectionMatrix * mv;
}`;
const glowFragment = `
varying vec3 vTint; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d); a *= a;
  if (a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vTint, a * vAlpha);
  #include <colorspace_fragment>
}`;

type GlowRole = { goalId: string | null; stepId?: string; kind: 'soma' | 'spark' | 'step' | 'area' | 'sky'; size: number; strength: number; pulse: number; color?: string };
type InstanceRole = { goalId: string; stepId?: string; base: number };

function curve(points: THREE.Vector3[], segments: number) {
  if (points.length < 2) return points;
  return new THREE.CatmullRomCurve3(points, false, 'centripetal').getPoints((points.length - 1) * segments);
}

export function createGoalWorld(goals: WorldGoal[]): GoalWorldScene {
  const areaColors = new Map(goals.map(g => [g.fieldId, g.color]));
  const layout = layoutWorld(goals, areaColors), byId = new Map(layout.neurons.map(n => [n.goal.id, n]));
  const group = new THREE.Group();
  const ambient = new THREE.HemisphereLight('#ffffff', '#7d6aaf', 2.3);
  const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight('#9bbcff', 1.6); rim.position.set(3, 1, -2);

  // Somas: solid for active, paused and achieved goals; translucent for drafts.
  const somaGeometry = new THREE.SphereGeometry(1, 24, 16);
  const solid = layout.neurons.filter(n => n.goal.status !== 'draft'), drafts = layout.neurons.filter(n => n.goal.status === 'draft');
  const somaMesh = (rows: NeuronLayout[], material: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(somaGeometry, material, Math.max(1, rows.length));
    mesh.count = rows.length;
    const transform = new THREE.Object3D();
    rows.forEach((n, i) => { transform.position.copy(v(n.soma)); transform.scale.setScalar(n.radius); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, new THREE.Color(n.goal.color)); });
    return mesh;
  };
  const somas = somaMesh(solid, new THREE.MeshStandardMaterial({ roughness: .36, metalness: .1 }));
  const draftSomas = somaMesh(drafts, new THREE.MeshStandardMaterial({ roughness: .4, metalness: .05, transparent: true, opacity: .42, depthWrite: false }));
  group.add(somas, draftSomas);

  // Synapses: one instance per visible roadmap step.
  const stepRows = layout.neurons.flatMap(n => n.steps.map((step, i) => ({ n, step, point: n.synapses[i] })));
  const synapses = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: .3, metalness: .12 }), Math.max(1, stepRows.length));
  synapses.count = stepRows.length;
  const stepScale = (row: typeof stepRows[number], selected: boolean) => (row.step.completed ? .056 : row.step.next ? .066 : .042) * (selected ? 1.6 : 1);
  const placeStep = (index: number, selected: boolean) => {
    const row = stepRows[index], transform = new THREE.Object3D();
    transform.position.copy(v(row.point)); transform.scale.setScalar(stepScale(row, selected)); transform.updateMatrix();
    synapses.setMatrixAt(index, transform.matrix);
  };
  stepRows.forEach((_, i) => placeStep(i, false));
  group.add(synapses);

  // Axons and dendrites: one line mesh for living goals, a dashed one for drafts. The lit part ends at the last finished step.
  const lineSet = (rows: NeuronLayout[]) => {
    const positions: number[] = [], colors: number[] = [], owners: Array<{ goalId: string; lit: boolean }> = [];
    const push = (points: THREE.Vector3[], goalId: string, lit: (t: number) => boolean) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], on = lit(i / (points.length - 1));
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z); colors.push(0, 0, 0, 0, 0, 0); owners.push({ goalId, lit: on });
      }
    };
    for (const n of rows) {
      const soma = v(n.soma), start = soma.clone().add(v(n.direction).multiplyScalar(n.radius));
      const nodes = [start, ...n.synapses.map(v)];
      if (nodes.length === 1) nodes.push(soma.clone().add(v(n.direction).multiplyScalar(n.radius + .3)));
      const finished = n.steps.reduce((last, s, i) => s.completed ? i + 1 : last, 0), share = n.steps.length ? finished / n.steps.length : 0;
      push(curve(nodes, 6), n.goal.id, t => t <= share + 1e-6 && share > 0);
      for (const branch of n.dendrites) push(curve(branch.map(v), 4), n.goal.id, () => n.goal.totalMinutes > 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry, owners };
  };
  const living = lineSet(layout.neurons.filter(n => n.goal.status !== 'draft' && n.goal.status !== 'achieved')), dashed = lineSet(drafts);
  const axons = new THREE.LineSegments(living.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .9 }));
  const draftAxons = new THREE.LineSegments(dashed.geometry, new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: .75, dashSize: .045, gapSize: .04 }));
  draftAxons.computeLineDistances();
  group.add(axons, draftAxons);

  // Progress arcs for measured goals, and faint guides: the full progress ring and the orbit of achieved goals.
  const arcPositions: number[] = [], arcColors: number[] = [], guidePositions: number[] = [];
  const ring = (center: THREE.Vector3, radius: number, from: number, to: number, target: number[], color?: THREE.Color, tilt = 0) => {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI * 2) * 48));
    for (let i = 0; i < steps; i++) {
      const a = from + (to - from) * i / steps, b = from + (to - from) * (i + 1) / steps;
      const point = (angle: number) => new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * Math.cos(tilt), Math.sin(angle) * radius * Math.sin(tilt)).add(center);
      const p = point(a), q = point(b);
      target.push(p.x, p.y, p.z, q.x, q.y, q.z);
      if (color) arcColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  };
  for (const n of layout.neurons) {
    if (!n.goal.progress) continue;
    const center = v(n.soma), radius = n.radius * 1.6 + .05;
    ring(center, radius, 0, Math.PI * 2, guidePositions, undefined, .5);
    if (n.goal.progress.fraction > 0) ring(center, radius, Math.PI / 2, Math.PI / 2 - n.goal.progress.fraction * Math.PI * 2, arcPositions, new THREE.Color(n.goal.color), .5);
  }
  if (layout.achievedRadius) ring(new THREE.Vector3(0, ACHIEVED_HEIGHT, 0), layout.achievedRadius, 0, Math.PI * 2, guidePositions, undefined, Math.PI / 2);
  ring(new THREE.Vector3(0, -.95, 0), 2.1, 0, Math.PI * 2, guidePositions, undefined, Math.PI / 2);
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arcPositions, 3));
  arcGeometry.setAttribute('color', new THREE.Float32BufferAttribute(arcColors, 3));
  const arcs = new THREE.LineSegments(arcGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95 }));
  const guides = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(guidePositions, 3)), new THREE.LineBasicMaterial({ transparent: true, opacity: .16 }));
  group.add(arcs, guides);

  // Glow: soma halos, sparks, lit synapses, area nebulae and the sky in one point cloud.
  const glowPositions: number[] = [], roles: GlowRole[] = [];
  const glow = (p: Vec3 | THREE.Vector3, role: GlowRole) => { glowPositions.push(p.x, p.y, p.z); roles.push(role); };
  for (const area of layout.areas) glow(area.center, { goalId: null, kind: 'area', size: 2.6, strength: .16, pulse: 0, color: area.color });
  for (const n of layout.neurons) {
    glow(n.soma, { goalId: n.goal.id, kind: 'soma', size: n.radius * 6, strength: n.goal.status === 'achieved' ? .5 : .32, pulse: 0 });
    n.sparks.forEach(s => glow(s.point, { goalId: n.goal.id, kind: 'spark', size: s.small ? .07 : .11, strength: s.small ? .55 : .9, pulse: 0 }));
    n.steps.forEach((step, i) => { if (step.completed || step.next) glow(n.synapses[i], { goalId: n.goal.id, stepId: step.id, kind: 'step', size: step.next ? .3 : .2, strength: step.next ? .55 : .35, pulse: step.next && n.goal.status === 'active' ? seedFor(step.id) % 100 / 100 + .01 : 0 }); });
  }
  let sky = 7331;
  const random = () => { sky = (sky * 1664525 + 1013904223) >>> 0; return sky / 4294967296; };
  for (let i = 0; i < 170; i++) {
    const phi = Math.acos(1 - 2 * random()), theta = random() * Math.PI * 2, r = 6 + random() * 3;
    glow({ x: Math.sin(phi) * Math.cos(theta) * r, y: Math.cos(phi) * r * .6, z: Math.sin(phi) * Math.sin(theta) * r }, { goalId: null, kind: 'sky', size: .05 + random() * .05, strength: .35 + random() * .35, pulse: 0 });
  }
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
  const sizes = new Float32Array(roles.length), strengths = new Float32Array(roles.length), tints = new Float32Array(roles.length * 3);
  glowGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  glowGeometry.setAttribute('strength', new THREE.BufferAttribute(strengths, 1));
  glowGeometry.setAttribute('pulse', new THREE.Float32BufferAttribute(roles.map(r => r.pulse), 1));
  glowGeometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  const glowMaterial = new THREE.ShaderMaterial({ vertexShader: glowVertex, fragmentShader: glowFragment, uniforms: { time: { value: 0 }, pointScale: { value: 1 } }, transparent: true, depthWrite: false });
  const glows = new THREE.Points(glowGeometry, glowMaterial);
  glows.frustumCulled = false;
  group.add(glows);

  // Invisible, larger pick targets, so small synapses stay easy to click.
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false }), hitGeometry = new THREE.SphereGeometry(1, 8, 6);
  const hitRoles: InstanceRole[] = [...layout.neurons.map(n => ({ goalId: n.goal.id, base: n.radius + .12 })), ...stepRows.map(r => ({ goalId: r.n.goal.id, stepId: r.step.id, base: .1 }))];
  const hits = new THREE.InstancedMesh(hitGeometry, hitMaterial, Math.max(1, hitRoles.length));
  hits.count = hitRoles.length;
  hitRoles.forEach((role, i) => {
    const transform = new THREE.Object3D();
    transform.position.copy(v(role.stepId ? stepRows[i - layout.neurons.length].point : byId.get(role.goalId)!.soma)); transform.scale.setScalar(role.base); transform.updateMatrix();
    hits.setMatrixAt(i, transform.matrix);
  });
  group.add(hits);

  // Colors depend on theme, palette and selection; they are written again only when one of these changes.
  let paintedKey = '';
  const paint = (frame: GoalWorldFrame) => {
    const paintKey = [frame.theme, frame.color, frame.selectedId, frame.focusId, frame.selectedStepId].join('|');
    if (paintKey === paintedKey) return;
    paintedKey = paintKey;
    const dark = frame.theme === 'dark', neutral = new THREE.Color(dark ? '#4c4862' : '#bdb8cc'), palette = new THREE.Color(frame.color);
    const tone = (goalId: string | null, base: string, mute = 0) => {
      const n = goalId ? byId.get(goalId) : undefined, color = new THREE.Color(base);
      const paused = n?.goal.status === 'paused', away = frame.focusId !== null && goalId !== frame.focusId;
      return color.lerp(neutral, Math.min(.85, mute + (paused ? .55 : 0) + (away ? .7 : 0)));
    };
    solid.forEach((n, i) => somas.setColorAt(i, tone(n.goal.id, n.goal.color)));
    drafts.forEach((n, i) => draftSomas.setColorAt(i, tone(n.goal.id, n.goal.color)));
    stepRows.forEach((row, i) => { synapses.setColorAt(i, tone(row.n.goal.id, row.n.goal.color, row.step.completed || row.step.next ? 0 : .65)); placeStep(i, row.step.id === frame.selectedStepId); });
    for (const mesh of [somas, draftSomas, synapses]) { if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    synapses.instanceMatrix.needsUpdate = true;
    for (const set of [living, dashed]) {
      const colors = set.geometry.getAttribute('color') as THREE.BufferAttribute;
      set.owners.forEach((owner, i) => {
        const n = byId.get(owner.goalId)!, color = tone(owner.goalId, n.goal.color, owner.lit ? 0 : .6);
        colors.setXYZ(i * 2, color.r, color.g, color.b); colors.setXYZ(i * 2 + 1, color.r, color.g, color.b);
      });
      colors.needsUpdate = true;
    }
    (guides.material as THREE.LineBasicMaterial).color.copy(palette);
    glowMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    roles.forEach((role, i) => {
      const n = role.goalId ? byId.get(role.goalId) : undefined;
      const base = role.kind === 'sky' ? palette.clone() : role.kind === 'area' ? palette.clone().lerp(new THREE.Color(role.color ?? frame.color), .55) : tone(role.goalId, n!.goal.color);
      const selected = role.goalId !== null && role.goalId === frame.selectedId, stepSelected = role.stepId !== undefined && role.stepId === frame.selectedStepId;
      const away = frame.focusId !== null && role.goalId !== null && role.goalId !== frame.focusId;
      tints.set([base.r, base.g, base.b], i * 3);
      sizes[i] = role.size * (role.kind === 'soma' && selected ? 1.35 : stepSelected ? 1.8 : 1);
      strengths[i] = role.strength * (dark ? 1 : role.kind === 'sky' ? .9 : .75) * (away ? .2 : 1) * (role.kind === 'soma' && selected ? 1.5 : stepSelected ? 1.6 : 1);
    });
    for (const name of ['size', 'strength', 'tint']) glowGeometry.getAttribute(name).needsUpdate = true;
  };

  // The displayed view eases toward the requested one. Focus pivots the world around the focused neuron.
  const shown = { yaw: -.32, pitch: -.38, zoom: 1, blend: 0, started: false }, anchor = new THREE.Vector3(), rotated = new THREE.Vector3();
  const update = (frame: GoalWorldFrame, camera: THREE.PerspectiveCamera) => {
    paint(frame);
    const focused = frame.focusId ? byId.get(frame.focusId) : undefined;
    if (focused) anchor.copy(v(focused.focus));
    const ease = (rate: number) => frame.motion && shown.started ? 1 - Math.exp(-rate * frame.elapsed) : 1;
    let yawDelta = (frame.view.yaw - shown.yaw) % (Math.PI * 2);
    if (yawDelta > Math.PI) yawDelta -= Math.PI * 2; else if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    shown.yaw += yawDelta * ease(12); shown.pitch += (frame.view.pitch - shown.pitch) * ease(12); shown.zoom += (frame.view.zoom - shown.zoom) * ease(12);
    shown.blend += ((focused ? 1 : 0) - shown.blend) * ease(7);
    shown.started = true;
    group.rotation.set(shown.pitch, shown.yaw, 0);
    rotated.copy(anchor).applyEuler(group.rotation).multiplyScalar(-shown.blend);
    group.position.copy(rotated);
    const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const overview = Math.max(1.35 / slope, 3.4 / (slope * camera.aspect)) + 1.4, close = Math.max(.75 / slope, 1 / (slope * camera.aspect)) + .5;
    const distance = THREE.MathUtils.lerp(overview, close, shown.blend) / shown.zoom;
    camera.position.set(0, distance * .05, distance); camera.lookAt(0, 0, 0);
    glowMaterial.uniforms.time.value = frame.time; glowMaterial.uniforms.pointScale.value = frame.pointScale;
    return Math.abs(shown.blend - (focused ? 1 : 0)) > .002 || Math.abs(yawDelta) > .002 || Math.abs(frame.view.pitch - shown.pitch) > .002 || Math.abs(frame.view.zoom - shown.zoom) > .002;
  };

  const pick = (raycaster: THREE.Raycaster): GoalWorldPick | null => {
    const hit = raycaster.intersectObject(hits)[0];
    if (hit?.instanceId === undefined) return null;
    const role = hitRoles[hit.instanceId];
    return role.stepId ? { goalId: role.goalId, stepId: role.stepId } : { goalId: role.goalId };
  };
  const screen = (camera: THREE.PerspectiveCamera, width: number, height: number) => layout.neurons.map(n => {
    const point = v(n.soma).applyMatrix4(group.matrixWorld).project(camera);
    return { id: n.goal.id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
  });
  return { group, lights: [ambient, key, rim], targets: [hits], pick, update, screen };
}
