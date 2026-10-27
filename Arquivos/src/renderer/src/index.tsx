import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadStats } from '../../shared/insight-stats';
import './app.css';

document.documentElement.classList.toggle('floating-window', new URLSearchParams(window.location.search).has('mini'));
async function mount() {
  // The example insights run in this window, and the preview runs every service here; the app still opens if the module fails.
  await loadStats().catch(error => console.error(error));
  if (import.meta.env.DEV && import.meta.env.FOCUS_GUIDE_PREVIEW && new URLSearchParams(location.search).has('preview')) {
    const { installPreview } = await import('./preview'); installPreview();
  }
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
}
void mount();
