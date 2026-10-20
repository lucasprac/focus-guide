import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Floating timer: a constellation of neurons in the shape of a brain, seen from the left side.
// All neurons show from the start as faint stars. As the session forms (0–1, from brainFormation),
// lines draw from neuron to neuron and trace the brain: first its silhouette, then the cerebellum
// and brainstem, then the fissures and sulci. A neuron lights up when a line reaches it.
// The scene is display only.
export interface BrainConstellationFrame { color: string; progress: number; time: number; moving: boolean }
export interface BrainConstellationScene {
  group: THREE.Group;
  halfWidth: number; halfHeight: number; halfDepth: number;
  update: (frame: BrainConstellationFrame) => void;
}

const SPACING = .13, MERGE_DISTANCE = .07, STAR_COUNT = 46, STAR_GAP = .1;
const LINE_RADIUS = .009, FAINT_RADIUS = .017, LIT_RADIUS = .03;
type Point = [number, number];
// Side view with the frontal lobe on the left. The order is the drawing order.
const BRAIN_LINES: Point[][] = [
  // Cerebrum silhouette: from the frontal base over the top to the occipital pole, then under the temporal lobe.
  [[-.62, -.12], [-.85, -.14], [-1.05, .08], [-1.02, .42], [-.78, .7], [-.4, .85], [0, .88], [.4, .81], [.74, .6], [.99, .3], [1.08, 0], [1, -.2]],
  [[1, -.2], [.78, -.3], [.45, -.33], [.12, -.46], [-.22, -.5], [-.5, -.4], [-.62, -.22], [-.52, -.08]],
  // Cerebellum and brainstem.
  [[.46, -.36], [.5, -.54], [.66, -.66], [.86, -.64], [1, -.5], [1.02, -.32], [.92, -.24]],
  [[.22, -.42], [.2, -.62], [.26, -.82], [.3, -.96]],
  [[.42, -.4], [.42, -.62], [.42, -.84], [.44, -.96]],
  // Lateral (Sylvian) fissure and central sulcus.
  [[-.52, -.08], [-.25, 0], [.05, .08], [.32, .2], [.48, .34]],
  [[.02, .88], [0, .68], [-.05, .5], [.02, .3], [-.02, .12]],
  // Precentral and postcentral sulci, intraparietal sulcus.
  [[-.2, .86], [-.22, .62], [-.25, .42], [-.22, .18]],
  [[.25, .82], [.24, .6], [.4, .5], [.62, .45], [.85, .38]],
  // Frontal sulci.
  [[-.85, .5], [-.6, .52], [-.38, .58], [-.2, .62]],
  [[-.9, .2], [-.68, .24], [-.45, .28], [-.25, .3]],
  // Temporal sulci.
  [[-.45, -.25], [-.15, -.2], [.15, -.12], [.45, 0], [.68, .12]],
  [[-.3, -.38], [0, -.34], [.3, -.25], [.6, -.18]],
  // Parieto-occipital edge and cerebellar folia.
  [[.72, .6], [.78, .35], [.85, .12], [.9, -.1]],
  [[.52, -.45], [.75, -.48], [.95, -.42]],
  [[.6, -.58], [.8, -.58], [.96, -.5]]
];
const OUTLINE = [...BRAIN_LINES[0], ...BRAIN_LINES[1]];
const CEREBELLUM = BRAIN_LINES[2];

function random(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function inside(polygon: Point[], x: number, y: number) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}

// Builds once per module: neurons along each line (shared where lines meet), the ordered
// segments between them, and faint unconnected stars that fill the brain.
const next = random(2026);
const neurons: THREE.Vector3[] = [];
const litAt: number[] = [];
const segments: Array<[number, number]> = [];
function neuronAt(point: THREE.Vector3) {
  const near = neurons.findIndex(n => Math.hypot(n.x - point.x, n.y - point.y) < MERGE_DISTANCE);
  if (near >= 0) return near;
  neurons.push(point.setZ((next() - .5) * .16)); litAt.push(Infinity);
  return neurons.length - 1;
}
for (const line of BRAIN_LINES) {
  const curve = new THREE.CatmullRomCurve3(line.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const points = curve.getSpacedPoints(Math.max(2, Math.round(curve.getLength() / SPACING)));
  let previous = neuronAt(points[0]);
  for (const point of points.slice(1)) {
    const current = neuronAt(point);
    if (current === previous) continue;
    // A neuron lights as the line that starts at it begins, or as the line that ends at it arrives.
    litAt[previous] = Math.min(litAt[previous], segments.length);
    litAt[current] = Math.min(litAt[current], segments.length + 1);
    segments.push([previous, current]);
    previous = current;
  }
}
for (let attempt = 0, stars = 0; stars < STAR_COUNT && attempt < 4000; attempt++) {
  const x = -1.08 + next() * 2.16, y = -.7 + next() * 1.6;
  if (!inside(OUTLINE, x, y) && !inside(CEREBELLUM, x, y)) continue;
  if (neurons.some(n => Math.hypot(n.x - x, n.y - y) < STAR_GAP)) continue;
  neurons.push(new THREE.Vector3(x, y, (next() - .5) * .3)); litAt.push(1e6); stars++;
}
const bounds = new THREE.Box3().setFromPoints(neurons);
const center = bounds.getCenter(new THREE.Vector3());

function lineGeometry() {
  const parts = segments.map(([from, to], order) => {
    const tube = new THREE.TubeGeometry(new THREE.LineCurve3(neurons[from], neurons[to]), 1, 1, 4, false);
    tube.setAttribute('order', new THREE.Float32BufferAttribute(new Array(tube.getAttribute('position').count).fill(order), 1));
    return tube;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return merged;
}

export function createBrainConstellation(): BrainConstellationScene {
  const color = new THREE.Color(), line = new THREE.Color(), faint = new THREE.Color(), core = new THREE.Color(), white = new THREE.Color('#ffffff');
  const uniforms = {
    uReveal: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 },
    uColor: { value: color }, uLine: { value: line }, uFaint: { value: faint }, uCore: { value: core },
    uLineRadius: { value: LINE_RADIUS }, uFaintRadius: { value: FAINT_RADIUS }, uLitRadius: { value: LIT_RADIUS }
  };
  const lines = new THREE.Mesh(lineGeometry(), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `uniform float uReveal, uLineRadius;
      attribute float order;
      varying float vAlong, vGrow, vOrder;
      void main() {
        vAlong = uv.x; vOrder = order;
        // Segments draw one after another, like a pen tracing each brain line.
        vGrow = clamp(uReveal - order, 0., 1.);
        // Tubes are built with radius 1, so the shader sets the radius.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * (uLineRadius - 1.), 1.);
      }`,
    fragmentShader: `uniform vec3 uLine, uCore; uniform float uReveal, uTime, uPulse;
      varying float vAlong, vGrow, vOrder;
      void main() {
        if (vGrow <= 0. || vAlong > vGrow) discard;
        // A faint signal travels along the formed lines in drawing order.
        float signal = mod(uTime * 2.5, uReveal + 24.) - (vOrder + vAlong);
        gl_FragColor = vec4(mix(uLine, uCore, uPulse * .75 * exp(-signal * signal * .3)), 1.);
        #include <colorspace_fragment>
      }`
  }));
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const nodes = new THREE.InstancedMesh(sphere, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `uniform float uReveal, uTime, uFaintRadius, uLitRadius;
      attribute float litAt; attribute float phase;
      varying vec3 vNormal; varying float vLit;
      void main() {
        float lit = smoothstep(litAt - .35, litAt, uReveal);
        // Unlit stars twinkle a little; lit neurons breathe slowly.
        float wave = sin(uTime * mix(.8, .45, lit) + phase * 6.2832);
        float radius = mix(uFaintRadius * (1. + .25 * wave), uLitRadius * (1. + .06 * wave), lit);
        vLit = lit;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position * radius, 1.);
      }`,
    // A light core keeps a lit neuron round at a few pixels; the rim keeps the full color.
    fragmentShader: `uniform vec3 uColor, uFaint, uCore; varying vec3 vNormal; varying float vLit;
      void main() {
        vec3 lit = mix(uColor, uCore, smoothstep(.45, 1., normalize(vNormal).z) * .55);
        gl_FragColor = vec4(mix(uFaint, lit, vLit), 1.);
        #include <colorspace_fragment>
      }`
  }), neurons.length);
  const transform = new THREE.Object3D(), phases = new Float32Array(neurons.length), rand = random(77);
  neurons.forEach((neuron, index) => {
    transform.position.copy(neuron); transform.updateMatrix(); nodes.setMatrixAt(index, transform.matrix);
    phases[index] = rand();
  });
  sphere.setAttribute('litAt', new THREE.InstancedBufferAttribute(Float32Array.from(litAt, value => Math.min(value, 1e6)), 1));
  sphere.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
  lines.frustumCulled = false; nodes.frustumCulled = false;
  // The outer group sways around the brain center; the inner one centers the brain.
  const group = new THREE.Group(), brain = new THREE.Group();
  brain.position.copy(center).negate();
  brain.add(lines, nodes); group.add(brain);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    group, halfWidth: size.x / 2 + .07, halfHeight: size.y / 2 + .07, halfDepth: .2,
    update({ color: base, progress, time, moving }) {
      color.set(base); line.copy(color).lerp(white, .22); faint.copy(color).lerp(white, .62); core.copy(color).lerp(white, .5);
      uniforms.uReveal.value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * segments.length;
      uniforms.uTime.value = time; uniforms.uPulse.value = moving ? 1 : 0;
      group.rotation.set(.06 * Math.sin(time * Math.PI * 2 / 61 + 1), .16 * Math.sin(time * Math.PI * 2 / 47), 0);
    }
  };
}
