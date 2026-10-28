import { createServer, type Server, type Socket } from 'node:net';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAccess, AgentBridgeStatus } from '../shared/types';
import { AGENT_BRIDGE_FILE, AGENT_MESSAGE_LIMIT, accessError, allowsTool, isAgentTool, type AgentBridgeFile } from '../shared/agent-tools';
import { atomicWrite } from './backup';

/* A local endpoint for the MCP server that an AI agent starts. It listens on a Windows named pipe only while
   the user allows agent access. Each request carries a random token that the app writes to its data folder,
   and only the agent tools are accepted: never the renderer commands, timer changes, deletions or restores. */
export class AgentBridge {
  private server: Server | null = null;
  private sockets = new Set<Socket>();
  private token = '';
  status: AgentBridgeStatus;
  constructor(private options: { directory: string; access: () => AgentAccess; call: (tool: string, input: Record<string, unknown>, source: string) => Promise<unknown>; launch: AgentBridgeStatus['launch']; onStatus?: () => void }) {
    this.status = { state: 'off', message: 'O acesso do agente de IA está desligado.', launch: options.launch };
  }
  private get file() { return join(this.options.directory, AGENT_BRIDGE_FILE); }
  sync(): void { if (this.options.access() === 'off') this.stop(); else if (!this.server) this.start(); }
  private start(): void {
    const pipe = `\\\\.\\pipe\\focus-guide-agent-${randomUUID()}`;
    this.token = randomBytes(32).toString('hex');
    const server = createServer({ allowHalfOpen: false }, socket => this.connection(socket));
    server.maxConnections = 4;
    server.on('error', error => { this.status = { ...this.status, state: 'error', message: `A ponte do agente parou: ${error.message}` }; this.stop(false); this.options.onStatus?.(); });
    server.listen(pipe, () => {
      try {
        atomicWrite(this.file, JSON.stringify({ version: 1, pipe, token: this.token, pid: process.pid } satisfies AgentBridgeFile));
        this.status = { ...this.status, state: 'ready', message: 'Pronto para um servidor MCP local enquanto o Focus Guide estiver aberto.' };
      } catch (error) { this.status = { ...this.status, state: 'error', message: `A ponte do agente não conseguiu salvar o arquivo de conexão: ${error instanceof Error ? error.message : error}` }; this.stop(false); }
      this.options.onStatus?.();
    });
    this.server = server;
  }
  stop(reset = true): void {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server?.close(); this.server = null; this.token = '';
    try { unlinkSync(this.file); } catch { /* No connection file exists when the bridge did not start. */ }
    if (reset) this.status = { ...this.status, state: 'off', message: 'O acesso do agente de IA está desligado.' };
  }
  private authorized(token: unknown): boolean {
    if (typeof token !== 'string' || !this.token) return false;
    const a = Buffer.from(token), b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private connection(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '', queue = Promise.resolve();
    const reply = (value: Record<string, unknown>) => { if (!socket.destroyed) socket.write(JSON.stringify(value) + '\n'); };
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > AGENT_MESSAGE_LIMIT) { reply({ id: null, ok: false, error: 'A solicitação é grande demais.' }); socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        queue = queue.then(() => this.handle(line).then(reply));
      }
    });
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => this.sockets.delete(socket));
  }
  private async handle(line: string): Promise<Record<string, unknown>> {
    let id: unknown = null;
    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
      if (!this.authorized(message.token)) throw new Error('A ponte do agente rejeitou a solicitação. Reinicie o servidor MCP para que ele leia o arquivo de conexão atual.');
      const access = this.options.access();
      if (!isAgentTool(message.tool)) throw new Error('Esta ferramenta não está disponível.');
      if (!allowsTool(access, message.tool)) throw new Error(accessError(access));
      const input = message.input && typeof message.input === 'object' && !Array.isArray(message.input) ? message.input as Record<string, unknown> : {};
      if (JSON.stringify(input).length > 30000) throw new Error('A entrada da ferramenta é grande demais.');
      const source = typeof message.client === 'string' && message.client.trim() ? message.client.trim().slice(0, 100) : 'MCP client';
      return { id, ok: true, value: await this.options.call(message.tool, input, source) };
    } catch (error) { return { id, ok: false, error: error instanceof Error ? error.message : 'A solicitação falhou.' }; }
  }
}
