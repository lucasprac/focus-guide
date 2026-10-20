import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { SceneProps } from './ThreeScene';

const Scene = lazy(() => import('./ThreeScene'));
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function NeuralVisual({ fallback, software, label, ...props }: Omit<SceneProps, 'onReady'> & { fallback: ReactNode; software: boolean; label?: string }) {
  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState('');
  const [shown, setShown] = useState(document.visibilityState !== 'hidden');
  const [windowShown, setWindowShown] = useState(true);
  useEffect(() => {
    const visibility = () => setShown(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    const remove = window.focusGuide?.onEvent(event => { if (event.type === 'visibility') setWindowShown(event.visible); });
    return () => { document.removeEventListener('visibilitychange', visibility); remove?.(); };
  }, []);
  return <div className={`neural-visual neural-${props.kind}`} data-renderer={software || !ready ? 'fallback' : 'webgl'} data-fallback-reason={software ? 'Software rendering requested' : reason} role={label ? 'img' : undefined} aria-label={label}>
    <div className="neural-fallback" hidden={!software && ready}>{fallback}</div>
    {!software && <SceneBoundary onFailure={() => { setReady(false); setReason('Scene module unavailable'); }}><Suspense fallback={null}><Scene {...props} visible={props.visible && shown && windowShown} onReady={(value, failure) => { setReady(value); if (failure) setReason(failure); }} /></Suspense></SceneBoundary>}
  </div>;
}
