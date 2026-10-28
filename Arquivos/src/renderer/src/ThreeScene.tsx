import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createBrain } from './BrainScene';
import { createBrainConstellation } from './NeuronScene';
export interface SceneProps {
  kind: 'focus' | 'floating'; color: string; theme: 'light' | 'dark';
  progress?: number; running?: boolean; moving: boolean; visible: boolean;
  onReady: (ready: boolean, reason?: string) => void;
}

export default function ThreeScene(props: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(props);
  const [failed, setFailed] = useState(false);
  const invalidate = useRef<() => void>(() => {});
  latest.current = props;
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
      const camera = new THREE.PerspectiveCamera(30, 1, .1, 40);
      const focus = props.kind === 'focus' ? createBrain() : null;
      const floating = props.kind === 'floating' ? createBrainConstellation() : null;
      if (focus) scene.add(...focus.lights);
      const group = focus?.group ?? floating!.group;
      // The floating timer stays on screen while you work, so its slow formation renders at a lower rate.
      const frameMs = 1000 / (floating ? 20 : 30);
      scene.add(group);
      const drawingBuffer = new THREE.Vector2();
      const draw = (now: number) => {
        frame = 0;
        const current = latest.current;
        if (disposed || !current.visible) { previous = 0; return; }
        if (current.moving && previous && now - previous < frameMs - 1) { frame = requestAnimationFrame(draw); return; }
        const elapsed = previous ? Math.min((now - previous) / 1000, .08) : 0;
        previous = now;
        if (current.moving) time += elapsed;
        const fitted = (focus ?? floating)!;
        // Fit the brain or the constellation to the canvas at any aspect ratio, with a margin for the sway.
        const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const moving = Boolean(current.running && current.moving);
        if (focus) focus.update({ color: current.color, theme: current.theme, progress: current.progress ?? 0, time, moving, pointScale: renderer!.getDrawingBufferSize(drawingBuffer).y / (2 * slope) });
        else floating!.update({ color: current.color, progress: current.progress ?? 0, time, moving });
        const distance = Math.max(fitted.halfHeight / slope, fitted.halfWidth / (slope * camera.aspect)) * 1.04 + fitted.halfDepth;
        camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
        scene.updateMatrixWorld(true);
        renderer!.render(scene, camera);
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
  }, [props.kind, failed]);
  useEffect(() => { invalidate.current(); }, [props.color, props.progress, props.running, props.moving, props.visible, props.theme]);
  return failed ? null : <canvas ref={canvas} className="three-canvas" data-scene={props.kind} aria-hidden="true" />;
}
