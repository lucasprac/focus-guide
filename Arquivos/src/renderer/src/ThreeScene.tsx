import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { createBrain } from './BrainScene';
import { createBrainConstellation } from './NeuronScene';
import { createGoalWorld, type GoalWorldView } from './GoalWorldScene';
import type { WorldGoal } from '../../shared/goal-world';

export type SceneView = GoalWorldView;
export interface SceneProps {
  kind: 'focus' | 'world' | 'floating'; color: string; theme: 'light' | 'dark';
  progress?: number; running?: boolean; moving: boolean; visible: boolean;
  /* Neural World only. The scene rebuilds its geometry when worldKey changes. */
  goals?: WorldGoal[]; worldKey?: string; selectedId?: string | null; selectedStepId?: string | null; focusId?: string | null; view?: SceneView;
  labelRef?: RefObject<HTMLElement | null>;
  onSelect?: (goalId: string, stepId?: string) => void; onReady: (ready: boolean, reason?: string) => void;
}

export default function ThreeScene(props: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(props);
  const [failed, setFailed] = useState(false);
  const invalidate = useRef<() => void>(() => {});
  latest.current = props;
  useEffect(() => {
    if (failed || !canvas.current) return;
    const element = canvas.current;
    let renderer: THREE.WebGLRenderer | undefined, frame = 0, disposed = false, previous = 0, time = 0, settling = false;
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
      const world = props.kind === 'world' ? createGoalWorld(latest.current.goals ?? []) : null;
      if (focus) scene.add(...focus.lights);
      else if (world) scene.add(...world.lights);
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
        const target = world.pick(raycaster);
        if (target) latest.current.onSelect?.(target.goalId, target.stepId);
      };
      // The stage captures drag pointers. Listen there so a captured pointer-up can still select a goal.
      const interactionTarget = world ? element.closest('.goal-world-stage') ?? element : element;
      interactionTarget.addEventListener('pointerdown', pointerDown as EventListener);
      interactionTarget.addEventListener('pointerup', pointerUp as EventListener);
      const draw = (now: number) => {
        frame = 0;
        const current = latest.current;
        let animating = false;
        if (disposed || !current.visible) { previous = 0; return; }
        if ((current.moving || settling) && previous && now - previous < frameMs - 1) { frame = requestAnimationFrame(draw); return; }
        const elapsed = previous ? Math.min((now - previous) / 1000, .08) : 0;
        previous = now;
        if (current.moving) time += elapsed;
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
          const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          animating = world!.update({ view: current.view ?? { yaw: -.32, pitch: -.38, zoom: 1 }, focusId: current.focusId ?? null, selectedId: current.selectedId ?? null, selectedStepId: current.selectedStepId ?? null, color: current.color, theme: current.theme, time, elapsed, motion: current.moving, pointScale: renderer!.getDrawingBufferSize(drawingBuffer).y / (2 * slope) }, camera);
        }
        scene.updateMatrixWorld(true);
        renderer!.render(scene, camera);
        if (world) {
          const targets = world.screen(camera, element.clientWidth, element.clientHeight);
          element.dataset.pickTargets = JSON.stringify(targets);
          // The selected goal's HTML label follows its soma without a React render.
          const label = current.labelRef?.current, anchor = targets.find(target => target.id === current.selectedId);
          if (label) { label.hidden = !anchor; if (anchor) label.style.transform = `translate(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px)`; }
        }
        element.dataset.frames = String(Number(element.dataset.frames ?? 0) + 1);
        element.dataset.drawCalls = String(renderer!.info.render.calls);
        element.dataset.triangles = String(renderer!.info.render.triangles);
        element.dataset.geometries = String(renderer!.info.memory.geometries);
        latest.current.onReady(true);
        settling = animating;
        if (current.moving || animating) frame = requestAnimationFrame(draw);
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
  }, [props.kind, props.worldKey, failed]);
  useEffect(() => { invalidate.current(); }, [props.color, props.progress, props.running, props.moving, props.visible, props.theme, props.view, props.selectedId, props.selectedStepId, props.focusId]);
  return failed ? null : <canvas ref={canvas} className="three-canvas" data-scene={props.kind} aria-hidden="true" />;
}
