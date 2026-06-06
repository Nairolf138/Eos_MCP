/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import osc from 'osc';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createHttpGateway, type HttpGateway } from '../httpGateway';
import { ToolRegistry } from '../toolRegistry';
import { toolDefinitions } from '../../tools/index';
import {
  OscConnectionStateProvider,
  type OscDiagnostics,
  type OscMessage
} from '../../services/osc/index';
import {
  getOscGateway,
  initializeOscClient,
  setOscClient,
  type OscGateway,
  type OscGatewaySendOptions
} from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';

declare const fetch: typeof globalThis.fetch;

type JsonRpcPayload = Record<string, unknown>;
type ToolCallMetadata = Record<string, unknown>;

interface ToolCallResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

class MinimalEosOscSimulator {
  private socket?: Socket;

  public readonly received: OscMessage[] = [];

  public port = 0;

  public async start(): Promise<void> {
    this.socket = createSocket('udp4');
    this.socket.on('message', (buffer, remote) => this.handlePacket(buffer, remote));

    await new Promise<void>((resolve, reject) => {
      this.socket?.once('error', reject);
      this.socket?.bind(0, '127.0.0.1', () => {
        this.socket?.off('error', reject);
        const address = this.socket?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Port UDP du simulateur EOS introuvable.'));
          return;
        }
        this.port = address.port;
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.close(() => resolve());
      this.socket = undefined;
    });
  }

  public count(address: string): number {
    return this.received.filter((message) => message.address === address).length;
  }

  private handlePacket(buffer: Buffer, remote: RemoteInfo): void {
    const packet = osc.readPacket(buffer, { metadata: true }) as unknown;
    const messages = this.extractMessages(packet);
    messages.forEach((message) => {
      this.received.push(message);
      this.respond(message, remote);
    });
  }

  private extractMessages(packet: unknown): OscMessage[] {
    if (!packet || typeof packet !== 'object') {
      return [];
    }

    const candidate = packet as OscMessage & { packets?: unknown[] };
    if (typeof candidate.address === 'string') {
      return [{ address: candidate.address, args: candidate.args ?? [] }];
    }

    if (Array.isArray(candidate.packets)) {
      return candidate.packets.flatMap((entry) => this.extractMessages(entry));
    }

    return [];
  }

  private respond(message: OscMessage, remote: RemoteInfo): void {
    switch (message.address) {
      case '/eos/ping':
        this.send('/eos/out/ping', { status: 'ok', echo: this.getFirstArg(message) ?? 'pong' }, remote);
        return;
      case '/eos/handshake':
        this.sendRaw(
          '/eos/handshake/reply',
          [
            { type: 's', value: 'ETCOSC!' },
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.10-sim', protocols: ['json-v1'] })
            }
          ],
          remote
        );
        return;
      case '/eos/protocol/select':
        this.send('/eos/protocol/select/reply', { status: 'ok', selectedProtocol: this.getFirstArg(message) }, remote);
        return;
      case oscMappings.patch.channelInfo:
        this.send(message.address, {
          status: 'ok',
          channel: {
            channel: 101,
            label: 'Key Wash',
            parts: [
              {
                part: 1,
                label: 'Key Wash',
                manufacturer: 'ETC',
                model: 'Source Four LED Series 3',
                dmx_address: '1/101'
              }
            ]
          }
        }, remote);
        return;
      case oscMappings.dmx.addressSelect:
        this.send(message.address, {
          status: 'ok',
          address: '1/101',
          dmx: 128,
          level: 50,
          source: 'simulator'
        }, remote);
        return;
      case oscMappings.dmx.addressDmx:
      case oscMappings.dmx.addressLevel:
        this.send(message.address, { status: 'ok', applied: this.parseJsonArg(message) }, remote);
        return;
      case oscMappings.macros.info:
        this.send(message.address, {
          status: 'ok',
          macro: { number: 7, label: 'House to half', commands: ['Group 1 At 50 Enter'] }
        }, remote);
        return;
      case oscMappings.cues.list:
        this.send(message.address, {
          status: 'ok',
          cues: [{ cue: 1, cue_number: 1, cuelist: 1, cuelist_number: 1, label: 'E2E 1' }]
        }, remote);
        return;
      default:
        if (message.address.startsWith('/eos/get/')) {
          this.send(message.address, { status: 'ok', data: [], count: 0 }, remote);
        }
    }
  }

  private parseJsonArg(message: OscMessage): unknown {
    const raw = this.getFirstArg(message);
    if (typeof raw !== 'string') {
      return raw ?? null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch (_error) {
      return raw;
    }
  }

  private getFirstArg(message: OscMessage): unknown {
    return message.args?.[0]?.value;
  }

  private send(address: string, payload: Record<string, unknown>, remote: RemoteInfo): void {
    this.sendRaw(address, [{ type: 's', value: JSON.stringify(payload) }], remote);
  }

  private sendRaw(address: string, args: Array<{ type: string; value: unknown }>, remote: RemoteInfo): void {
    const encoded = Buffer.from(
      osc.writePacket({ address, args }, { metadata: true }) as Uint8Array
    );
    this.socket?.send(encoded, remote.port, remote.address);
  }
}


class UdpOscTestGateway implements OscGateway {
  private readonly socket: Socket;

  private readonly listeners = new Set<(message: OscMessage) => void>();

  private readonly startedAt = Date.now();

  private incomingCount = 0;

  private outgoingCount = 0;

  public constructor(
    private readonly options: { localPort: number; remotePort: number; connectionStateProvider: OscConnectionStateProvider }
  ) {
    this.socket = createSocket('udp4');
    this.socket.on('message', (buffer) => {
      const packet = osc.readPacket(buffer, { metadata: true }) as unknown;
      this.extractMessages(packet).forEach((message) => {
        this.incomingCount += 1;
        this.listeners.forEach((listener) => listener(message));
      });
    });
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.bind(this.options.localPort, '127.0.0.1', () => {
        this.socket.off('error', reject);
        const now = Date.now();
        this.options.connectionStateProvider.setStatus({
          type: 'udp',
          state: 'connected',
          lastHeartbeatAckAt: now,
          lastHeartbeatSentAt: now,
          consecutiveFailures: 0
        });
        this.options.connectionStateProvider.setStatus({
          type: 'tcp',
          state: 'connected',
          lastHeartbeatAckAt: now,
          lastHeartbeatSentAt: now,
          consecutiveFailures: 0
        });
        resolve();
      });
    });
  }

  public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
    const encoded = Buffer.from(osc.writePacket(message, { metadata: true }) as Uint8Array);
    await new Promise<void>((resolve, reject) => {
      this.socket.send(encoded, this.options.remotePort, '127.0.0.1', (error) => {
        if (error) {
          reject(error);
          return;
        }
        this.outgoingCount += 1;
        resolve();
      });
    });
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getConnectionStateProvider(): OscConnectionStateProvider {
    return this.options.connectionStateProvider;
  }

  public getDiagnostics(): OscDiagnostics {
    const now = Date.now();
    return {
      config: {
        localAddress: '127.0.0.1',
        localPort: this.options.localPort,
        remoteAddress: '127.0.0.1',
        remotePort: this.options.remotePort
      },
      logging: { incoming: false, outgoing: false },
      stats: {
        incoming: { count: this.incomingCount, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] },
        outgoing: { count: this.outgoingCount, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] }
      },
      listeners: { active: this.listeners.size },
      startedAt: this.startedAt,
      uptimeMs: now - this.startedAt
    };
  }

  public close(): void {
    this.socket.close();
    this.listeners.clear();
  }

  public setToolPreference(): void {
    // Transport preferences are intentionally accepted but ignored by the isolated UDP e2e gateway.
  }

  private extractMessages(packet: unknown): OscMessage[] {
    if (!packet || typeof packet !== 'object') {
      return [];
    }
    const candidate = packet as OscMessage & { packets?: unknown[] };
    if (typeof candidate.address === 'string') {
      return [{ address: candidate.address, args: candidate.args ?? [] }];
    }
    if (Array.isArray(candidate.packets)) {
      return candidate.packets.flatMap((entry) => this.extractMessages(entry));
    }
    return [];
  }
}

async function getAvailableUdpPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      socket.off('error', reject);
      const address = socket.address();
      socket.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Port UDP dynamique introuvable.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

describe('MCP HTTP e2e with a minimal EOS OSC simulator', () => {
  jest.setTimeout(20_000);

  let simulator: MinimalEosOscSimulator;
  let gateway: HttpGateway;
  let baseUrl: string;
  let rootServer: McpServer;

  const createRegisteredServer = (): { server: McpServer; registry: ToolRegistry } => {
    const server = new McpServer({ name: 'eos-mcp-e2e', version: '0.0.0-e2e' });
    const registry = new ToolRegistry(server);
    registry.registerMany(toolDefinitions);
    return { server, registry };
  };

  const createMcpServer = (): McpServer => createRegisteredServer().server;

  const postMcp = async (
    body: JsonRpcPayload,
    sessionId?: string
  ): Promise<{ response: Response; payload: JsonRpcPayload }> => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId
          ? {
              'mcp-session-id': sessionId,
              'mcp-protocol-version': LATEST_PROTOCOL_VERSION
            }
          : {})
      },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as JsonRpcPayload;
    return { response, payload };
  };

  const initializeSession = async (): Promise<string> => {
    const { response, payload } = await postMcp({
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'jest-e2e-client', version: '0.0.1' }
      }
    });

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect((payload.result as { serverInfo?: { name?: string } }).serverInfo?.name).toBe('eos-mcp-e2e');

    const sessionId = response.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    return sessionId!;
  };

  const callTool = async (
    sessionId: string,
    name: string,
    args: Record<string, unknown> = {},
    metadata?: ToolCallMetadata
  ): Promise<ToolCallResult> => {
    const params = {
      name,
      arguments: args,
      ...(metadata ? { _meta: metadata } : {})
    };

    const { response, payload } = await postMcp(
      {
        jsonrpc: '2.0',
        id: `call-${name}`,
        method: 'tools/call',
        params
      },
      sessionId
    );

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    return payload.result as ToolCallResult;
  };

  beforeAll(async () => {
    simulator = new MinimalEosOscSimulator();
    await simulator.start();

    const oscConnectionState = new OscConnectionStateProvider();
    const oscGateway = new UdpOscTestGateway({
      localPort: await getAvailableUdpPort(),
      remotePort: simulator.port,
      connectionStateProvider: oscConnectionState
    });
    await oscGateway.start();
    initializeOscClient(oscGateway);

    const registeredRoot = createRegisteredServer();
    rootServer = registeredRoot.server;
    const rootRegistry = registeredRoot.registry;

    gateway = createHttpGateway(rootRegistry, {
      port: 0,
      host: '127.0.0.1',
      serverFactory: async () => createMcpServer(),
      oscConnectionProvider: oscConnectionState,
      oscGateway: { getDiagnostics: () => getOscGateway().getDiagnostics() }
    });

    await gateway.start();
    const httpAddress = gateway.getAddress();
    if (!httpAddress) {
      throw new Error('Adresse HTTP MCP introuvable.');
    }
    baseUrl = `http://127.0.0.1:${httpAddress.port}`;
  });

  afterAll(async () => {
    await gateway.stop();
    await rootServer.close();
    getOscGateway().close?.();
    setOscClient(null);
    await simulator.stop();
  });

  test('runs a full MCP flow over HTTP against the EOS OSC simulator', async () => {
    const sessionId = await initializeSession();

    const toolsResponse = await fetch(`${baseUrl}/tools`);
    expect(toolsResponse.status).toBe(200);
    const toolsPayload = (await toolsResponse.json()) as { tools?: Array<{ name?: string }> };
    expect(toolsPayload.tools?.some((tool) => tool.name === 'eos_connect')).toBe(true);
    expect(toolsPayload.tools?.some((tool) => tool.name === 'eos_workflow_patch_fixture')).toBe(true);

    const listedTools = await postMcp(
      { jsonrpc: '2.0', id: 'tools-list', method: 'tools/list', params: {} },
      sessionId
    );
    expect((listedTools.payload.result as { tools?: unknown[] }).tools?.length).toBeGreaterThan(10);

    const connect = await callTool(sessionId, 'eos_connect', {
      handshakeTimeoutMs: 500,
      protocolTimeoutMs: 500,
      preferredProtocols: ['json-v1'],
      transportPreference: 'speed'
    });
    expect(connect.structuredContent).toMatchObject({
      status: 'ok',
      version: '3.2.10-sim',
      selectedProtocol: 'json-v1',
      can_read_queries: true
    });

    const capabilities = await callTool(sessionId, 'eos_capabilities_get', {});
    expect(capabilities.structuredContent?.server).toBeDefined();
    expect(capabilities.structuredContent?.context).toBeDefined();

    const adminToolMetadata = { grantedRole: 'admin' };

    const recordCue = await callTool(sessionId, 'eos_workflow_create_cue_series', {
      base_cuelist_number: 1,
      start_cue_number: 1,
      looks: [{ channels: '101', intensity: 50, cue_label: 'E2E 1' }],
      require_confirmation: true
    }, adminToolMetadata);
    expect(recordCue.structuredContent?.status).toBe('ok');
    expect(simulator.received.some((message) => thisIsCommand(message, 'Record Cue 1/1'))).toBe(true);

    const updateCue = await callTool(sessionId, 'eos_workflow_update_cue_look', {
      cuelist_number: 1,
      cue_number: 1,
      channels: '101',
      intensity_factor: 1,
      require_confirmation: true
    }, adminToolMetadata);
    expect(updateCue.structuredContent?.status).toBe('ok');
    expect(simulator.received.some((message) => thisIsCommand(message, 'Update Cue 1/1'))).toBe(true);

    const go = await callTool(sessionId, 'eos_cue_go', {
      cuelist_number: 1,
      cue_number: 1,
      confirm: true
    }, adminToolMetadata);
    expect(go.structuredContent).toMatchObject({ action: 'cue_go' });
    expect(simulator.received.some((message) => thisIsCommand(message, 'Cue 1 CueList 1 Go'))).toBe(true);

    const patchFixture = await callTool(sessionId, 'eos_workflow_patch_fixture', {
      channel_number: 101,
      dmx_address: '1/101',
      device_type: 'Source Four LED Series 3 Lustr X8',
      label: 'Key Wash',
      require_confirmation: true
    }, adminToolMetadata);
    expect(patchFixture.structuredContent?.status).toBe('ok');
    expect(simulator.received.some((message) => thisIsCommand(message, 'Patch Chan 101 Part 1 Address 1/101'))).toBe(true);

    const dmxRead = await callTool(sessionId, 'eos_address_select', {
      address_number: '1/101',
      confirm: true
    }, adminToolMetadata);
    expect(dmxRead.structuredContent).toMatchObject({
      status: 'ok',
      address: '1/101',
      osc: expect.objectContaining({ address: oscMappings.dmx.addressSelect })
    });

    const macro = await callTool(sessionId, 'eos_macro_fire', { macro_number: 7, confirm: true }, adminToolMetadata);
    expect(macro.structuredContent).toMatchObject({ action: 'macro_fire', macro_number: 7 });
    expect(simulator.count(oscMappings.macros.fire)).toBeGreaterThanOrEqual(1);

    const closeResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION
      }
    });
    expect(closeResponse.status).toBe(200);
  });
});

function thisIsCommand(message: OscMessage, expectedFragment: string): boolean {
  const firstArg = message.args?.[0]?.value;
  return (
    (message.address === '/eos/newcmd' || message.address === '/eos/cmd') &&
    typeof firstArg === 'string' &&
    firstArg.includes(expectedFragment)
  );
}
