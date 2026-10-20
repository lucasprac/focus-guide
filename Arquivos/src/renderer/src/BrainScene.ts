import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural Focus brain: two folded hemispheres, cerebellum and brainstem.
// Session progress lights the cortex from the frontal pole to the back; it is display only.
export interface BrainFrame {
  color: string; theme: 'light' | 'dark'; progress: number;
  time: number; moving: boolean; pointScale: number;
}
export interface BrainScene {
  group: THREE.Group; lights: THREE.Light[];
  halfWidth: number; halfHeight: number; halfDepth: number;
  update: (frame: BrainFrame) => void;
}

const HEMISPHERE_DETAIL = 44, CEREBELLUM_DETAIL = 24, SPARK_COUNT = 180;
const MEDIAL_FLAT = .2, LATERAL_RADIUS = .62, FISSURE_HALF_GAP = .022;
const HEMISPHERE_CENTER = MEDIAL_FLAT * LATERAL_RADIUS + FISSURE_HALF_GAP;
const LAST_ACTIVATION = .97, GYRUS_BANDS = 3.5, SULCUS_DEPTH = .045;

function random(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const permutation = (() => {
  const next = random(1907), values = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return Uint8Array.from([...values, ...values]);
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
function gradient(hash: number, x: number, y: number, z: number) {
  const h = hash & 15, u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}
// Improved Perlin noise with a fixed permutation, so every launch builds the same brain.
function noise(x: number, y: number, z: number) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255, p = permutation;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
  return mix(
    mix(mix(gradient(p[AA], x, y, z), gradient(p[BA], x - 1, y, z), u), mix(gradient(p[AB], x, y - 1, z), gradient(p[BB], x - 1, y - 1, z), u), v),
    mix(mix(gradient(p[AA + 1], x, y, z - 1), gradient(p[BA + 1], x - 1, y, z - 1), u), mix(gradient(p[AB + 1], x, y - 1, z - 1), gradient(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
// Evenly spaced contour bands of domain-warped noise meander like gyri; their zero lines become narrow sulci.
function gyri(x: number, y: number, z: number) {
  const wx = noise(x * 1.1 + 3.1, y * 1.1, z * 1.1), wy = noise(x * 1.1, y * 1.1 + 7.7, z * 1.1), wz = noise(x * 1.1, y * 1.1, z * 1.1 + 12.9);
  const qx = (x + wx * .5) * 2.3, qy = (y + wy * .5) * 2.3, qz = (z + wz * .5) * 2.3;
  const field = noise(qx, qy, qz) + .35 * noise(qx * 2.1 + 5, qy * 2.1, qz * 2.1);
  return Math.abs(Math.sin(field * Math.PI * GYRUS_BANDS)) ** .6;
}
function unitSphere(detail: number) {
  const source = new THREE.IcosahedronGeometry(1, detail);
  source.deleteAttribute('normal'); source.deleteAttribute('uv');
  const geometry = mergeVertices(source);
  source.dispose();
  return geometry;
}
function finish(geometry: THREE.BufferGeometry, ridge: Float32Array, shade: Float32Array) {
  geometry.setAttribute('ridge', new THREE.BufferAttribute(ridge, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hemisphere(side: 1 | -1, geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const ridge = new Float32Array(position.count), shade = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const dx = position.getX(i), dy = position.getY(i), dz = position.getZ(i);
    const lateral = dx * side, front = Math.max(0, dz), back = Math.max(0, -dz);
    const temporal = Math.exp(-(((dz - .12) / .36) ** 2)) * smoothstep(-.1, .55, lateral);
    // The medial wall flattens smoothly, so the hemispheres meet at a narrow longitudinal fissure.
    let x = (lateral >= 0 ? lateral : -MEDIAL_FLAT * (1 - Math.exp(lateral / MEDIAL_FLAT))) * LATERAL_RADIUS * (1 - .2 * front * front - .18 * back ** 3);
    let y = dy >= 0 ? dy * .6 * (1 - .2 * front * front + .06 * back) : dy * (.34 + .4 * temporal) * (1 - .25 * front);
    let z = dz * .97;
    // The lateral (Sylvian) fissure separates the temporal lobe from the frontal and parietal lobes.
    const fissureY = -.3 - .42 * (dz - .45);
    const sylvian = Math.exp(-(((dy - fissureY) / .1) ** 2)) * smoothstep(.15, .6, lateral) * smoothstep(-.45, -.2, dz) * smoothstep(.62, .4, dz);
    const fold = gyri(x + side * 4.1, y, z);
    const length = Math.hypot(x, y, z), inward = .2 * sylvian * length + SULCUS_DEPTH * (1 - fold) * (1 - .6 * sylvian);
    const scale = Math.max(.2, 1 - inward / length);
    x *= scale; y *= scale; z *= scale;
    position.setXYZ(i, side * (HEMISPHERE_CENTER + x), y, z);
    ridge[i] = fold;
    const cavity = (.46 + .54 * fold) * (1 - .5 * sylvian) * (.72 + .28 * smoothstep(-.6, .05, lateral));
    shade.set([cavity, cavity, cavity], i * 3);
  }
  return finish(geometry, ridge, shade);
}

function cerebellum() {
  const geometry = unitSphere(CEREBELLUM_DETAIL), position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const ridge = new Float32Array(position.count), shade = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const dx = position.getX(i), dy = position.getY(i), dz = position.getZ(i);
    // Folia are thin parallel folds that wrap around the sagittal plane.
    const folds = Math.sin(Math.atan2(dy, -dz) * 26 + 1.2 * noise(dx * 2, dy * 2, dz * 2));
    const fold = smoothstep(0, .45, Math.abs(folds));
    const vermis = Math.exp(-((dx / .12) ** 2)) * smoothstep(0, .6, -dz);
    const scale = 1 - .05 * (1 - fold) - .12 * vermis;
    position.setXYZ(i, dx * .56 * scale, -.42 + dy * .23 * scale, -.55 + dz * .32 * scale);
    ridge[i] = fold;
    const cavity = (.62 + .38 * fold) * (1 - .3 * vermis);
    shade.set([cavity, cavity, cavity], i * 3);
  }
  return finish(geometry, ridge, shade);
}

function brainstem() {
  const geometry = new THREE.CylinderGeometry(.13, .085, .55, 20, 4, true);
  geometry.rotateX(.28); geometry.translate(0, -.56, -.16);
  const count = geometry.getAttribute('position').count;
  return finish(geometry, new Float32Array(count).fill(.5), new Float32Array(count * 3).fill(.7));
}

// Activation runs in the on-screen direction of the progress bar: from the frontal pole on the left
// to the occipital pole and cerebellum on the right. Low-frequency noise keeps the front organic.
function assignActivation(geometries: THREE.BufferGeometry[], rotation: THREE.Euler) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation), point = new THREE.Vector3();
  const screenX = geometries.map(geometry => {
    const position = geometry.getAttribute('position');
    return Float32Array.from({ length: position.count }, (_, i) => point.fromBufferAttribute(position, i).applyMatrix4(matrix).x);
  });
  const min = Math.min(...screenX.map(values => values.reduce((a, b) => Math.min(a, b)))), max = Math.max(...screenX.map(values => values.reduce((a, b) => Math.max(a, b))));
  geometries.forEach((geometry, g) => {
    const position = geometry.getAttribute('position'), values = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const ridge = geometry.getAttribute('ridge').getX(i);
      const jitter = .06 * noise(position.getX(i) * 2.4, position.getY(i) * 2.4, position.getZ(i) * 2.4) - .025 * ridge;
      values[i] = .01 + (LAST_ACTIVATION - .01) * Math.max(0, Math.min(1, (screenX[g][i] - min) / (max - min) + jitter));
    }
    geometry.setAttribute('activation', new THREE.BufferAttribute(values, 1));
  });
}

// Sparks sit on gyral crests and appear once the activation front has passed them.
function sparks(sources: THREE.BufferGeometry[]) {
  const next = random(2203), positions: number[] = [], normals: number[] = [], activation: number[] = [], phase: number[] = [];
  const crests = sources.flatMap(geometry => {
    const ridge = geometry.getAttribute('ridge'), list: [THREE.BufferGeometry, number][] = [];
    for (let i = 0; i < ridge.count; i++) if (ridge.getX(i) > .97) list.push([geometry, i]);
    return list;
  });
  for (let n = 0; n < SPARK_COUNT && crests.length; n++) {
    const [geometry, i] = crests.splice(Math.floor(next() * crests.length), 1)[0];
    const point = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), i);
    const normal = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), i);
    point.addScaledVector(normal, .012);
    positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
    activation.push(Math.max(.02, geometry.getAttribute('activation').getX(i)));
    phase.push(next());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('activation', new THREE.Float32BufferAttribute(activation, 1));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  return geometry;
}

export function createBrain(): BrainScene {
  const uniforms = {
    uProgress: { value: 0 }, uTime: { value: 0 }, uGlow: { value: new THREE.Color() }, uLitBase: { value: new THREE.Color() },
    uTint: { value: .6 }, uLit: { value: .3 }, uBand: { value: 1 }, uPulse: { value: 0 },
    uSpark: { value: new THREE.Color() }, uSparkOpacity: { value: 1 }, uScale: { value: 300 }
  };
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .04 });
  surface.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float activation;\nattribute float ridge;\nvarying float vActivation;\nvarying float vRidge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvActivation = activation;\nvRidge = ridge;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uProgress, uTime, uTint, uLit, uBand, uPulse;\nuniform vec3 uGlow, uLitBase;\nvarying float vActivation;\nvarying float vRidge;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lit = smoothstep(vActivation - .02, vActivation + .002, uProgress);
        float crest = smoothstep(.35, 1., vRidge);
        float band = exp(-pow((uProgress - vActivation) / .022, 2.)) * smoothstep(0., .03, uProgress) * (1. - smoothstep(.96, 1., uProgress));
        float pulse = .5 + .5 * sin(vActivation * 46. - uTime * 1.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uLitBase * vColor.rgb, lit * uTint * (.55 + .45 * crest));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlow * (lit * crest * (uLit + uPulse * pulse * pulse) + band * uBand * (.35 + .65 * crest));`);
  };
  const spark = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `uniform float uProgress, uTime, uScale;
      attribute float activation; attribute float phase; varying float vAlpha;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        float twinkle = .6 + .4 * sin(uTime * (1. + phase * 1.4) + phase * 6.2832);
        // Sparks on surfaces seen edge-on would read as dust around the silhouette, so they fade out.
        float facing = smoothstep(.25, .6, normalize(normalMatrix * normal).z);
        vAlpha = smoothstep(activation - .015, activation + .005, uProgress) * twinkle * facing;
        gl_PointSize = .03 * uScale * (.7 + .3 * twinkle) / -view.z;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform vec3 uSpark; uniform float uSparkOpacity; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - .5);
        gl_FragColor = vec4(uSpark, smoothstep(.5, .08, d) * vAlpha * uSparkOpacity);
        #include <colorspace_fragment>
      }`
  });
  // +x is the left hemisphere. This view shows its lateral side from slightly in front and above:
  // the frontal pole points left, and the longitudinal fissure and cerebellum stay visible.
  const model = new THREE.Group();
  model.rotation.set(.5, -.88, 0);
  // Both hemispheres start from one sphere; building and merging it is the slowest step of the setup.
  const sphere = unitSphere(HEMISPHERE_DETAIL);
  const left = hemisphere(1, sphere.clone()), right = hemisphere(-1, sphere), back = cerebellum(), stem = brainstem();
  assignActivation([left, right, back, stem], model.rotation);
  for (const [geometry, name] of [[left, 'left-hemisphere'], [right, 'right-hemisphere'], [back, 'cerebellum'], [stem, 'brainstem']] as const) {
    const mesh = new THREE.Mesh(geometry, surface); mesh.name = name; model.add(mesh);
  }
  const points = new THREE.Points(sparks([left, right]), spark); points.name = 'activation-sparks';
  model.add(points);
  const pivot = new THREE.Group(); pivot.add(model);
  const box = new THREE.Box3().setFromObject(model, true), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  const group = new THREE.Group(); group.add(pivot);

  const hemisphereLight = new THREE.HemisphereLight('#ffffff', '#5b4a86', 1.6);
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-2.5, 4, 4);
  const fill = new THREE.DirectionalLight('#d4dcff', .6); fill.position.set(3, -1, 2);
  const rim = new THREE.DirectionalLight('#ffffff', 1.4); rim.position.set(2, 2.5, -4);
  const session = new THREE.Color(), white = new THREE.Color('#ffffff');
  return {
    group, lights: [hemisphereLight, key, fill, rim], halfWidth: size.x / 2, halfHeight: size.y / 2, halfDepth: size.z / 2,
    update({ color, theme, progress, time, moving, pointScale }) {
      const dark = theme === 'dark';
      session.set(color);
      // Unlit cortex stays a quiet neutral, so the lit share of the session reads at a glance.
      surface.color.set(dark ? '#4f4c63' : '#e4e1ea').lerp(session, .05);
      uniforms.uLitBase.value.copy(session).lerp(white, dark ? .08 : .06);
      uniforms.uGlow.value.copy(session);
      uniforms.uTint.value = dark ? .8 : .86;
      uniforms.uLit.value = dark ? .5 : .12;
      uniforms.uBand.value = dark ? 1.4 : .8;
      uniforms.uPulse.value = moving ? (dark ? .3 : .12) : 0;
      uniforms.uSpark.value.copy(session).lerp(white, dark ? .75 : .9);
      uniforms.uSparkOpacity.value = dark ? .95 : .9;
      uniforms.uProgress.value = Math.max(0, Math.min(1, progress));
      uniforms.uTime.value = time;
      uniforms.uScale.value = pointScale;
      hemisphereLight.intensity = dark ? 1.2 : 1.7;
      hemisphereLight.groundColor.set(dark ? '#25222f' : '#8d88a0');
      key.intensity = dark ? 2.1 : 2.2;
      rim.color.copy(session).lerp(white, .7); rim.intensity = dark ? 1.6 : 1;
      // Time advances only while the scene moves, so a pause freezes the pose where it is.
      pivot.rotation.y = Math.sin(time * .35) * .09;
      pivot.scale.setScalar(1 + Math.sin(time * .65) * .008);
    }
  };
}
