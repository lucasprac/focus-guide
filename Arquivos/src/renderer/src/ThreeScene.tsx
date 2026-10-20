import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createBrain } from './BrainScene';
import { createBrainConstellation } from './NeuronScene';

export type Region = { id: string; name: string; minutes: number };
export type SceneView = { yaw: number; pitch: number; zoom: number };
export interface SceneProps {
  kind: 'focus' | 'world' | 'floating'; color: string; theme: 'light' | 'dark';
  progress?: number; running?: boolean; moving: boolean; visible: boolean;
  regions?: Region[]; selectedId?: string; view?: SceneView;
  onSelect?: (id: string) => void; onReady: (ready: boolean, reason?: string) => void;
}

function seedFor(id: string) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function constellation(regions: Region[]) {
  const group = new THREE.Group(), targets: THREE.Mesh[] = [];
  const nodeGeometry = new THREE.SphereGeometry(.065, 10, 8);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.24, 32, 24), new THREE.MeshStandardMaterial({ color: '#a99af7', roughness: .35, metalness: .12 }));
  group.add(core);
  // Sort by identity, so a changing time ranking never rearranges established fields.
  const stable = [...regions].sort((a, b) => a.id.localeCompare(b.id));
  for (let index = 0; index < stable.length; index++) {
    const region = stable[index], seed = seedFor(region.id);
    const angle = index / stable.length * Math.PI * 2 - .6;
    const center = new THREE.Vector3(Math.cos(angle) * 2.25, Math.sin(angle * 2 + .6) * .65, Math.sin(angle) * 1.35);
    const cluster = new THREE.Group();
    cluster.name = region.id;
    cluster.position.copy(center);
    const count = 6 + Math.min(14, Math.floor(Math.max(0, region.minutes) / 30));
    const material = new THREE.MeshStandardMaterial({ color: '#a99af7', roughness: .32, metalness: .12, emissive: '#a99af7', emissiveIntensity: .08 });
    const points = Array.from({ length: count }, (_, i) => {
      const theta = i * 2.399963 + seed % 100 / 100, r = .2 + Math.sqrt(i + 1) * .075;
      return new THREE.Vector3(Math.cos(theta) * r, Math.sin(i * 1.73) * r, Math.sin(theta) * r);
    });
    const edges: THREE.Vector3[] = [];
    const nodes = new THREE.InstancedMesh(nodeGeometry, material, points.length);
    nodes.userData.fieldId = region.id;
    const transform = new THREE.Object3D();
    points.forEach((point, i) => {
      transform.position.copy(point); transform.scale.setScalar(i === 0 ? 1.8 : .65 + (seed + i) % 5 / 10);
      transform.updateMatrix(); nodes.setMatrixAt(i, transform.matrix);
      if (i) edges.push(points[Math.floor((i - 1) / 2)], point);
    });
    cluster.add(nodes); targets.push(nodes);
    cluster.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), new THREE.LineBasicMaterial({ color: '#a99af7', transparent: true, opacity: .65 })));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'field-pick-target';
    hit.userData.fieldId = region.id; cluster.add(hit); targets.push(hit);
    group.add(cluster);
    const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), center.clone().multiplyScalar(.5).add(new THREE.Vector3(0, .4, 0)), center);
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(32)), new THREE.LineBasicMaterial({ color: '#a99af7', transparent: true, opacity: .18 })));
  }
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, n) => new THREE.Vector3(Math.cos(n / 128 * Math.PI * 2) * 2.8, 0, Math.sin(n / 128 * Math.PI * 2) * 2.8))), new THREE.LineBasicMaterial({ color: '#a99af7', transparent: true, opacity: .2 }));
    ring.rotation.x = i ? .7 : -.2; group.add(ring);
  }
  return { group, targets };
}

export default function ThreeScene(props: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(props);
  const [failed, setFailed] = useState(false);
  const invalidate = useRef<() => void>(() => {});
  latest.current = props;
  const regionKey = props.regions?.map(r => `${r.id}:${r.minutes}`).join('|') ?? '';
  useEffect(() => {
    if (failed || !canvas.current) return;
    const element = canvas.current;
    let renderer: THREE.WebGLRenderer | undefined, frame = 0, disposed = false, previous = 0, time = 0;
    let observer: ResizeObserver | undefined;
    const scene = new THREE.Scene();
    const fail = (reason: string) => { if (!disposed) { latest.current.onReady(false, reason); setFailed(true); } };
    const lost = (event: Event) => { event.preventDefault(); fail('WebGL context lost'); };
    element.addEventListener('webglcontextlost', lost);
    try {
      renderer = new THREE.WebGLRenderer({ canvas: element, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const camera = new THREE.PerspectiveCamera(props.kind === 'world' ? 42 : 30, 1, .1, 40);
      const focus = props.kind === 'focus' ? createBrain() : null;
      const floating = props.kind === 'floating' ? createBrainConstellation() : null;
      const world = props.kind === 'world' ? constellation(latest.current.regions ?? []) : null;
      if (focus) scene.add(...focus.lights);
      else if (world) {
        const ambient = new THREE.HemisphereLight('#ffffff', '#7d6aaf', 2.5);
        const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(-3, 4, 5);
        const rim = new THREE.DirectionalLight('#9bbcff', 2); rim.position.set(3, 1, -2);
        scene.add(ambient, key, rim);
      }
      const group = focus?.group ?? floating?.group ?? world!.group;
      // The floating timer stays on screen while you work, so its slow formation renders at a lower rate.
      const frameMs = 1000 / (floating ? 20 : 30);
      scene.add(group);
      const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), drawingBuffer = new THREE.Vector2();
      let down: { x: number; y: number } | null = null;
      const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
      const pointerUp = (event: PointerEvent) => {
        if (!world || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { down = null; return; }
        down = null;
        const rect = element.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const target = raycaster.intersectObjects(world.targets)[0]?.object.userData.fieldId;
        if (typeof target === 'string') latest.current.onSelect?.(target);
      };
      // The stage captures drag pointers. Listen there so a captured pointer-up can still select a field.
      const interactionTarget = world ? element.closest('.constellation-stage') ?? element : element;
      interactionTarget.addEventListener('pointerdown', pointerDown as EventListener);
      interactionTarget.addEventListener('pointerup', pointerUp as EventListener);
      const draw = (now: number) => {
        frame = 0;
        const current = latest.current;
        if (disposed || !current.visible) { previous = 0; return; }
        if (current.moving && previous && now - previous < frameMs - 1) { frame = requestAnimationFrame(draw); return; }
        const elapsed = previous ? Math.min((now - previous) / 1000, .08) : 0;
        previous = now;
        if (current.moving) time += elapsed;
        const color = new THREE.Color(current.color);
        const fitted = focus ?? floating;
        if (fitted) {
          // Fit the brain or the constellation to the canvas at any aspect ratio, with a margin for the sway.
          const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const moving = Boolean(current.running && current.moving);
          if (focus) focus.update({ color: current.color, theme: current.theme, progress: current.progress ?? 0, time, moving, pointScale: renderer!.getDrawingBufferSize(drawingBuffer).y / (2 * slope) });
          else floating!.update({ color: current.color, progress: current.progress ?? 0, time, moving });
          const distance = Math.max(fitted.halfHeight / slope, fitted.halfWidth / (slope * camera.aspect)) * 1.04 + fitted.halfDepth;
          camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
        } else {
          const view = current.view ?? { yaw: -.32, pitch: -.22, zoom: 1 };
          group.rotation.set(view.pitch, view.yaw, 0);
          camera.position.set(0, .15, 4.9 / view.zoom); camera.lookAt(0, 0, 0);
          group.traverse(object => {
            const drawable = object as THREE.Mesh;
            const material = drawable.material as THREE.MeshStandardMaterial | THREE.LineBasicMaterial | undefined;
            if (!material || Array.isArray(material)) return;
            material.color?.copy(color);
            if ('emissive' in material) {
              material.emissive.copy(color);
              const selected = object.parent?.name === current.selectedId;
              material.emissiveIntensity = selected ? .28 : .03;
            }
          });
        }
        scene.updateMatrixWorld(true);
        renderer!.render(scene, camera);
        if (world) element.dataset.pickTargets = JSON.stringify(world.targets.filter(target => target.name === 'field-pick-target').map(target => {
          const point = target.getWorldPosition(new THREE.Vector3()).project(camera);
          return { id: target.userData.fieldId, x: (point.x + 1) * element.clientWidth / 2, y: (1 - point.y) * element.clientHeight / 2 };
        }));
        element.dataset.frames = String(Number(element.dataset.frames ?? 0) + 1);
        element.dataset.drawCalls = String(renderer!.info.render.calls);
        element.dataset.triangles = String(renderer!.info.render.triangles);
        element.dataset.geometries = String(renderer!.info.memory.geometries);
        latest.current.onReady(true);
        if (current.moving) frame = requestAnimationFrame(draw);
      };
      const request = () => { if (!frame && !disposed && latest.current.visible) frame = requestAnimationFrame(draw); };
      invalidate.current = request;
      observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        if (!width || !height) return;
        renderer!.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); request();
      });
      observer.observe(element);
      request();
      return () => {
        disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
        element.removeEventListener('webglcontextlost', lost);
        interactionTarget.removeEventListener('pointerdown', pointerDown as EventListener); interactionTarget.removeEventListener('pointerup', pointerUp as EventListener);
        const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
        scene.traverse(object => {
          const drawable = object as THREE.Mesh;
          if (drawable.geometry) geometries.add(drawable.geometry);
          if (drawable.material) for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) materials.add(material);
        });
        geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); renderer?.dispose();
        invalidate.current = () => {};
      };
    } catch (error) { fail(error instanceof Error ? error.message : 'WebGL initialization failed'); }
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); element.removeEventListener('webglcontextlost', lost); renderer?.dispose(); };
  }, [props.kind, regionKey, failed]);
  useEffect(() => { invalidate.current(); }, [props.color, props.progress, props.running, props.moving, props.visible, props.theme, props.view, props.selectedId]);
  return failed ? null : <canvas ref={canvas} className="three-canvas" data-scene={props.kind} aria-hidden="true" />;
}
