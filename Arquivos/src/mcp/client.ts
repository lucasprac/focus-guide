import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AGENT_BRIDGE_FILE, type AgentBridgeFile, type AgentTool } from '../shared/agent-tools';

/* The client side of the local agent bridge, shared by the MCP server and the Claude Code hooks. It reads the
   connection file that the running app writes to its data folder and sends one tool call over the named pipe. */
export const unavailable = 'Focus Guide is not running, or AI agent access is off. Open Focus Guide, then select Settings > AI agent and choose an access level.';
export function dataDirectory(): string { return process.env.FOCUS_GUIDE_DATA_DIR || join(process.env.APPDATA ?? '', 'Focus Guide'); }
function bridge(): AgentBridgeFile {
  let file: AgentBridgeFile;
  try { file = JSON.parse(readFileSync(join(dataDirectory(), AGENT_BRIDGE_FILE), 'utf8')) as AgentBridgeFile; } catch { throw new Error(unavailable); }
  if (file.version !== 1 || typeof file.pipe !== 'string' || !file.pipe.startsWith('\\\\.\\pipe\\focus-guide-agent-') || typeof file.token !== 'string') throw new Error(unavailable);
  return file;
}
export function call(tool: AgentTool, input: Record<string, unknown>, options: { client?: string; timeoutMs?: number } = {}): Promise<unknown> {
  const { pipe, token } = bridge(), timeoutMs = options.timeoutMs ?? 30000;
  return new Promise((resolve, reject) => {
    const socket = connect(pipe);
    let buffer = '', done = false;
    const finish = (error: Error | null, value?: unknown) => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); if (error) reject(error); else resolve(value); };
    const timer = setTimeout(() => finish(new Error(`Focus Guide did not answer in ${Math.round(timeoutMs / 1000)} seconds. It may be busy or closing.`)), timeoutMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(JSON.stringify({ id: randomUUID(), token, tool, input, client: options.client ?? 'MCP client' }) + '\n'));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      try { const reply = JSON.parse(buffer.slice(0, end)) as { ok: boolean; value?: unknown; error?: string }; finish(reply.ok ? null : new Error(reply.error ?? 'The request failed.'), reply.value); }
      catch { finish(new Error('Focus Guide sent a reply that is not valid.')); }
    });
    socket.on('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ENOENT' ? new Error(unavailable) : error));
    socket.on('close', () => finish(new Error('Focus Guide closed the connection before it answered.')));
  });
}
