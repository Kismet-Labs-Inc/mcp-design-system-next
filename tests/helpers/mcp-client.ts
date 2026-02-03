/**
 * MCP client helper for integration tests.
 * Spawns the server process and sends JSON-RPC messages over stdio.
 */

import { spawn, type ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_PATH = join(__dirname, '..', '..', 'dist', 'index.js');

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class McpTestClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests: Map<
    number,
    { resolve: (value: JsonRpcResponse) => void; reject: (error: Error) => void }
  > = new Map();
  private buffer = '';

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout!.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr!.on('data', (data: Buffer) => {
        // Server logs to stderr, which is expected
        const msg = data.toString();
        if (msg.includes('Loaded manifest') || msg.includes('MCP server started')) {
          resolve();
        }
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Timeout for startup
      setTimeout(() => resolve(), 2000);
    });
  }

  private processBuffer(): void {
    // Process JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Client not started');
    }

    const id = ++this.messageId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + '\n');

      // Timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async initialize(): Promise<JsonRpcResponse> {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
  }

  async listTools(): Promise<JsonRpcResponse> {
    return this.sendRequest('tools/list', {});
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    return response.result as ToolResult;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
