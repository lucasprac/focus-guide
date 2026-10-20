import { contextBridge, ipcRenderer } from 'electron';
import type { AppEvent, Command, FocusGuideAPI } from '../shared/types';

const api: FocusGuideAPI = {
  getState: () => ipcRenderer.invoke('focus-guide:state'),
  command: (command: Command, input = {}) => ipcRenderer.invoke('focus-guide:command', command, input),
  onEvent: listener => {
    const handler = (_event: unknown, data: AppEvent) => listener(data);
    ipcRenderer.on('focus-guide:event', handler);
    return () => { ipcRenderer.removeListener('focus-guide:event', handler); };
  }
};
contextBridge.exposeInMainWorld('focusGuide', api);
