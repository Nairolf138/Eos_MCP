/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'node:events';
import osc from 'osc';
import { ErrorCode } from '../../../server/errors';
import { OscClient, parseLegacyHandshakeMessage, type ConnectResult } from '../client';
import type { OscGateway, OscGatewaySendOptions } from '../client';
import { createOscConnectionGateway } from '../gateway';
import type { OscMessage } from '../index';
import { runWithRequestContext } from '../../../server/requestContext';

type TransportType = 'tcp' | 'udp';

type TransportState = 'disconnected' | 'connecting' | 'connected';

interface TransportStatus {
  type: TransportType;
  state: TransportState;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  consecutiveFailures: number;
}

interface SendCall {
  toolId: string;
  payload: Buffer;
  transport: TransportType;
}

interface MockConnectionManager extends EventEmitter {
  ready: boolean;
  stopped: boolean;
  options: Record<string, unknown>;
  toolPreferences: Map<string, string>;
  sendCalls: SendCall[];
  emitMessage(type: TransportType, data: Buffer): void;
  emitStatus(status: TransportStatus): void;
  getStatus(type: TransportType): TransportStatus;
  stop(): void;
  setToolPreference(toolId: string, preference: string): void;
  getToolPreference(toolId: string): string;
  removeTool(toolId: string): void;
}

const gatewayManagers: MockConnectionManager[] = [];

jest.mock('../connectionManager.js', () => {
  return {
    OscConnectionManager: class extends EventEmitter {
      public readonly options: Record<string, unknown>;

      public readonly toolPreferences = new Map<string, string>();

      public readonly sendCalls: SendCall[] = [];

      public stopped = false;

      public ready = false;

      private readonly statuses: Record<TransportType, TransportStatus> = {
        tcp: {
          type: 'tcp',
          state: 'connecting',
          lastHeartbeatAckAt: null,
          lastHeartbeatSentAt: null,
          consecutiveFailures: 0
        },
        udp: {
          type: 'udp',
          state: 'disconnected',
          lastHeartbeatAckAt: null,
          lastHeartbeatSentAt: null,
          consecutiveFailures: 0
        }
      };

      public constructor(options: Record<string, unknown>) {
        super();
        this.options = options;
        gatewayManagers.push(this as unknown as MockConnectionManager);
      }

      public send(toolId: string, payload: Buffer): TransportType {
        const buffer = Buffer.isBuffer(payload) ? Buffer.from(payload) : Buffer.from(payload as Buffer);
        this.sendCalls.push({ toolId, payload: buffer, transport: 'tcp' });
        if (!this.ready) {
          throw new Error(
            "Aucun transport OSC disponible pour l'outil. Les connexions TCP et UDP sont indisponibles."
          );
        }
        return 'tcp';
      }

      public stop(): void {
        this.stopped = true;
      }

      public setToolPreference(toolId: string, preference: string): void {
        this.toolPreferences.set(toolId, preference);
      }

      public getToolPreference(toolId: string): string {
        return this.toolPreferences.get(toolId) ?? 'auto';
      }

      public removeTool(toolId: string): void {
        this.toolPreferences.delete(toolId);
      }

      public emitMessage(type: TransportType, data: Buffer): void {
        this.emit('message', { type, data });
      }

      public emitStatus(status: TransportStatus): void {
        this.statuses[status.type] = { ...status };
        this.emit('status', status);
      }

      public getStatus(type: TransportType): TransportStatus {
        return { ...this.statuses[type] };
      }
    }
  };
});

describe('OscClient', () => {
  function decodeOscMessage(payload: Buffer): { address: string; args: { type: string; value: unknown }[] } {
    const packet = osc.readPacket(payload, { metadata: true });
    if (!packet || typeof packet !== 'object' || packet === null) {
      throw new Error('Paquet OSC inattendu');
    }

    const message = packet as { address?: unknown; args?: unknown };
    if (typeof message.address !== 'string') {
      throw new Error('Adresse OSC manquante');
    }

    const args = Array.isArray(message.args)
      ? message.args.map((arg) => {
          if (!arg || typeof arg !== 'object') {
            throw new Error('Argument OSC inattendu');
          }

          const typed = arg as { type?: unknown; value?: unknown };
          if (typeof typed.type !== 'string') {
            throw new Error('Type d\'argument OSC invalide');
          }

          return { type: typed.type, value: typed.value };
        })
      : [];

    return { address: message.address, args };
  }

  function decodeOscAddress(payload: Buffer): string {
    return decodeOscMessage(payload).address;
  }

  class FakeOscService implements OscGateway {
    public readonly sentMessages: OscMessage[] = [];

    public readonly sendOptions: (OscGatewaySendOptions | undefined)[] = [];

    private readonly listeners = new Set<(message: OscMessage) => void>();

    public delayMs = 0;

    public activeSends = 0;

    public maxActiveSends = 0;

    public async send(message: OscMessage, options?: OscGatewaySendOptions): Promise<TransportType> {
      this.activeSends += 1;
      this.maxActiveSends = Math.max(this.maxActiveSends, this.activeSends);
      this.sentMessages.push(message);
      this.sendOptions.push(options ? { ...options } : undefined);
      if (this.delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
      }
      this.activeSends -= 1;
      return options?.transportPreference === 'reliability' ? 'tcp' : 'udp';
    }

    public onMessage(listener: (message: OscMessage) => void): () => void {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }

    public emit(message: OscMessage): void {
      this.listeners.forEach((listener) => listener(message));
    }

    public getActiveTransport(_toolId: string): TransportType | null {
      return 'udp';
    }
  }

  async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Condition not met within timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  afterEach(() => {
    jest.useRealTimers();
    gatewayManagers.splice(0, gatewayManagers.length);
    delete process.env.EOS_STRICT_MODE;
  });

  it('realise un handshake et selectionne le protocole prefere', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect({ preferredProtocols: ['udp', 'tcp'] });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/handshake/reply',
        args: [
          {
            type: 's',
            value: 'ETCOSC!'
          },
          {
            type: 's',
            value: JSON.stringify({ version: '3.2.0', protocols: ['udp', 'tcp'] })
          }
        ]
      });

      setTimeout(() => {
        service.emit({
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        });
      }, 0);
    });

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('udp');
    expect(result.protocolStatus).toBe('ok');
    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/eos/handshake',
      '/eos/protocol/select'
    ]);
    expect(service.sentMessages[0]?.args).toEqual([
      { type: 's', value: 'ETCOSC?' },
      { type: 's', value: 'mcp' },
      { type: 's', value: JSON.stringify({ preferredProtocols: ['udp', 'tcp'] }) }
    ]);
  });

  it('interprete les reponses canoniques du handshake et normalise les protocoles', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect({ preferredProtocols: ['udp'] });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/handshake/reply',
        args: [
          { type: 's', value: 'ETCOSC!' },
          { type: 's', value: '3.2.0' },
          { type: 's', value: 'proto:udp' },
          { type: 's', value: 'tcp' }
        ]
      });

      setTimeout(() => {
        service.emit({
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        });
      }, 0);
    });

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.availableProtocols).toEqual(['udp', 'tcp']);
    expect(result.selectedProtocol).toBe('udp');
    expect(result.protocolStatus).toBe('ok');
  });

  it('accepte un handshake legacy Onyx a partir des premiers messages /eos/out', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const legacyMessage: OscMessage = {
      address: '/eos/out/event/state',
      args: [{ type: 's', value: 'init' }]
    };

    const connectPromise = client.connect({ handshakeTimeoutMs: 50 });

    queueMicrotask(() => {
      service.emit(legacyMessage);
    });

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBeNull();
    expect(result.availableProtocols).toEqual([]);
    expect(result.protocolStatus).toBe('skipped');
    expect(result.handshakePayload).toEqual(legacyMessage);
    expect(result.error).toBeUndefined();
    expect(service.sentMessages.map((message) => message.address)).toContain('/eos/handshake');

    expect(parseLegacyHandshakeMessage(legacyMessage)).toEqual({
      version: null,
      protocols: [],
      raw: legacyMessage,
      mode: 'legacy'
    });
  });

  it('reemet le handshake periodiquement jusqu\'a reception de la reponse canonique', async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect({ handshakeTimeoutMs: 1500 });

    await Promise.resolve();

    const handshakeCount = (): number =>
      service.sentMessages.filter((message) => message.address === '/eos/handshake').length;

    expect(handshakeCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(handshakeCount()).toBe(2);

    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(handshakeCount()).toBe(3);

    service.emit({
      address: '/eos/handshake/reply',
      args: [
        { type: 's', value: 'ETCOSC!' },
        { type: 's', value: JSON.stringify({ version: '3.3.0', protocols: [] }) }
      ]
    });

    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(handshakeCount()).toBe(3);

    const result = await connectPromise;
    expect(result.status).toBe('ok');
    expect(result.protocolStatus).toBe('skipped');
  });

  it('interrompt les retransmissions du handshake apres un message legacy', async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const legacyMessage: OscMessage = {
      address: '/eos/out/event/state',
      args: [{ type: 's', value: 'init' }]
    };

    const connectPromise = client.connect({ handshakeTimeoutMs: 1500 });

    await Promise.resolve();

    const handshakeCount = (): number =>
      service.sentMessages.filter((message) => message.address === '/eos/handshake').length;

    expect(handshakeCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(handshakeCount()).toBe(2);

    service.emit(legacyMessage);

    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(handshakeCount()).toBe(2);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.handshakePayload).toEqual(legacyMessage);
    expect(result.protocolStatus).toBe('skipped');
  });

  it('signale une erreur lorsque la sentinelle de handshake est absente', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect();

    queueMicrotask(() => {
      service.emit({
        address: '/eos/handshake/reply',
        args: [{ type: 's', value: 'INVALID' }]
      });
    });

    await expect(connectPromise).resolves.toMatchObject<Partial<ConnectResult>>({
      status: 'error',
      availableProtocols: [],
      version: null,
      protocolStatus: 'skipped',
      selectedProtocol: null,
      error: expect.stringContaining('sentinelle')
    });
  });

  it("demarre le timeout du handshake uniquement une fois l'envoi effectue", async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    service.delayMs = 40;
    const client = new OscClient(service);

    const connectPromise = client.connect({ preferredProtocols: ['tcp'], handshakeTimeoutMs: 50 });

    queueMicrotask(() => {
      setTimeout(() => {
        service.emit({
          address: '/eos/handshake/reply',
          args: [
            {
              type: 's',
              value: 'ETCOSC!'
            },
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp'] })
            }
          ]
        });

        queueMicrotask(() => {
          service.emit({
            address: '/eos/protocol/select/reply',
            args: [{ type: 's', value: 'ok' }]
          });
        });
      }, 45);
    });

    await jest.advanceTimersByTimeAsync(45);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(50);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('tcp');
    expect(result.protocolStatus).toBe('ok');
    expect(service.sentMessages[0]?.args).toEqual([
      { type: 's', value: 'ETCOSC?' },
      { type: 's', value: 'mcp' },
      { type: 's', value: JSON.stringify({ preferredProtocols: ['tcp'] }) }
    ]);
  });

  it("retourne un statut timeout lorsque la console ne repond pas au handshake", async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.connect({ handshakeTimeoutMs: 10 });

    await jest.advanceTimersByTimeAsync(11);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(11);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(11);

    await expect(promise).resolves.toMatchObject<Partial<ConnectResult>>({
      status: 'timeout',
      availableProtocols: [],
      version: null,
      error: expect.stringContaining('expire')
    });
  });

  it('retourne un mode degrade lorsque le handshake expire mais que le ping repond et la lecture timeout', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.connect({ handshakeTimeoutMs: 5 });

    await waitFor(() => service.sentMessages.some((message) => message.address === '/eos/ping'), 200);

    service.emit({
      address: '/eos/out/ping',
      args: [
        {
          type: 's',
          value: JSON.stringify({ status: 'ok', echo: 'degraded-connect-probe' })
        }
      ]
    });

    const result = await promise;

    expect(result).toMatchObject<Partial<ConnectResult>>({
      status: 'ok',
      handshake_mode: 'degraded',
      can_send_commands: true,
      can_read_queries: false,
      version: null,
      protocolStatus: 'skipped',
      selectedProtocol: null
    });
    expect(result.limitations.join(' ')).toContain('Mode dégradé : envoi possible, lecture non garantie.');
    expect(result.limitations.join(' ')).toContain('Lecture des requêtes EOS non garantie');
    expect(service.sentMessages.map((message) => message.address)).toContain('/eos/get/cmd_line');
  });

  it('retente le handshake en mode speed apres un timeout TCP', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect({ handshakeTimeoutMs: 20 });

    await waitFor(() => service.sendOptions.length >= 1);

    expect(service.sendOptions[0]?.transportPreference).toBeUndefined();

    await waitFor(() =>
      service.sendOptions.some((options) => options?.transportPreference === 'speed')
    );

    service.emit({
      address: '/eos/handshake/reply',
      args: [
        {
          type: 's',
          value: 'ETCOSC!'
        },
        {
          type: 's',
          value: JSON.stringify({ version: '3.2.0', protocols: ['udp'] })
        }
      ]
    });

    await waitFor(() =>
      service.sentMessages.some((message) => message.address === '/eos/protocol/select')
    );

    service.emit({
      address: '/eos/protocol/select/reply',
      args: [{ type: 's', value: 'ok' }]
    });

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('udp');
    expect(
      service.sendOptions.some((options) => options?.transportPreference === 'speed')
    ).toBe(true);
    expect(service.sentMessages[0]?.args).toEqual([
      { type: 's', value: 'ETCOSC?' },
      { type: 's', value: 'mcp' }
    ]);
  });

  it('retourne le statut du ping et l\'echo', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const pingPromise = client.ping({ message: 'hello' });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/out/ping',
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', echo: 'hello' })
          }
        ]
      });
    });

    const result = await pingPromise;

    expect(result.status).toBe('ok');
    expect(result.echo).toBe('hello');
    expect(result.roundtripMs).not.toBeNull();
    expect(service.sentMessages[0]?.address).toBe('/eos/ping');
  });

  it('indique un timeout sur le ping lorsque la console ne repond pas', async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.ping({ timeoutMs: 5 });

    await Promise.resolve();
    jest.advanceTimersByTime(6);

    await expect(promise).resolves.toMatchObject({
      status: 'timeout',
      error: expect.stringContaining('expire')
    });
  });

  it('signale une connexion perdue pendant un ping', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const pingPromise = client.ping();

    queueMicrotask(() => {
      service.emit({
        address: '/eos/out/ping',
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'error', message: 'Connection lost to console' })
          }
        ]
      });
    });

    await expect(pingPromise).resolves.toMatchObject({
      status: 'error',
      error: expect.stringContaining('Connexion OSC perdue')
    });
  });

  it('confirme la souscription OSC', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const subscribePromise = client.subscribe({ path: '/eos/out/ping', rateHz: 5 });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/subscribe/reply',
        args: [{ type: 's', value: 'ok' }]
      });
    });

    const result = await subscribePromise;

    expect(result.status).toBe('ok');
    expect(result.path).toBe('/eos/out/ping');
    expect(service.sentMessages[0]?.address).toBe('/eos/subscribe');
  });

  it('gere les envois simultanes via la file', async () => {
    const service = new FakeOscService();
    service.delayMs = 10;
    const client = new OscClient(service, { requestConcurrency: 1, queueTimeoutMs: 100 });

    await Promise.all([
      client.sendMessage('/test/1'),
      client.sendMessage('/test/2'),
      client.sendMessage('/test/3')
    ]);

    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/test/1',
      '/test/2',
      '/test/3'
    ]);
    expect(service.maxActiveSends).toBe(1);
  });

  it('transmet les preferences de transport personnalisees pour les requetes JSON', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue', {
      toolId: 'custom_tool',
      transportPreference: 'reliability',
      responseAddress: '/custom/reply',
      payload: { status: 'ok' }
    });

    await waitFor(() => service.sendOptions.length >= 1);

    expect(service.sendOptions[0]?.toolId).toBe('custom_tool');
    expect(service.sendOptions[0]?.transportPreference).toBe('reliability');

    queueMicrotask(() => {
      service.emit({
        address: '/custom/reply',
        args: [{ type: 's', value: JSON.stringify({ status: 'ok', data: {} }) }]
      });
    });

    const result = await responsePromise;

    expect(result.status).toBe('ok');
    expect(result.payload).toEqual({
      address: '/custom/reply',
      args: [{ type: 's', value: JSON.stringify({ status: 'ok', data: {} }) }]
    });
  });

  it('accepte les variantes /eos/out/get pour les reponses JSON EOS', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue/list', {
      responseAddresses: ['/eos/get/cue/list', '/eos/out/get/cue/list']
    });

    await waitFor(() => service.sentMessages.length >= 1);

    expect(service.sentMessages[0]).toEqual({
      address: '/eos/get/cue/list',
      args: []
    });

    service.emit({
      address: '/eos/out/get/cue/list',
      args: [
        {
          type: 's',
          value: JSON.stringify({
            status: 'ok',
            cues: [{ number: '1', uid: 'cue-1', label: 'Intro' }]
          })
        }
      ]
    });

    const result = await responsePromise;

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({
      status: 'ok',
      cues: [{ number: '1', uid: 'cue-1', label: 'Intro' }]
    });
    expect(result.payload).toMatchObject({ address: '/eos/out/get/cue/list' });
  });





  it('applique responseShape pour les tableaux, scalaires et textes', async () => {
    const arrayService = new FakeOscService();
    const arrayClient = new OscClient(arrayService);
    const arrayPromise = arrayClient.requestJson('/eos/get/cue/list', { responseShape: 'array' });
    await waitFor(() => arrayService.sentMessages.length >= 1);
    arrayService.emit({
      address: '/eos/get/cue/list',
      args: [{ type: 's', value: JSON.stringify([{ number: '1', uid: 'cue:1' }]) }]
    });
    await expect(arrayPromise).resolves.toMatchObject({
      status: 'ok',
      data: [{ number: '1', uid: 'cue:1' }]
    });

    const scalarService = new FakeOscService();
    const scalarClient = new OscClient(scalarService);
    const scalarPromise = scalarClient.requestJson('/eos/get/group/count', { responseShape: 'scalar' });
    await waitFor(() => scalarService.sentMessages.length >= 1);
    scalarService.emit({
      address: '/eos/get/group/count',
      args: [{ type: 's', value: JSON.stringify('12') }]
    });
    await expect(scalarPromise).resolves.toMatchObject({ status: 'ok', data: '12' });

    const textService = new FakeOscService();
    const textClient = new OscClient(textService);
    const textPromise = textClient.requestJson('/eos/get/version', { responseShape: 'text' });
    await waitFor(() => textService.sentMessages.length >= 1);
    textService.emit({
      address: '/eos/get/version',
      args: [{ type: 's', value: 'Eos 3.2.0' }]
    });
    await expect(textPromise).resolves.toMatchObject({ status: 'ok', data: 'Eos 3.2.0' });
  });

  it('accepte un objet JSON sans status pour les endpoints qui ne lexigent pas explicitement', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/patch/chan_info');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/patch/chan_info',
      args: [{ type: 's', value: JSON.stringify({ channel: 101, label: 'Fixture' }) }]
    });

    const result = await responsePromise;

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ channel: 101, label: 'Fixture' });
  });

  it('refuse les lectures JSON quand la capacite de lecture reste non confirmee', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 10 });

    const capability = await client.probeCapabilities({ timeoutMs: 10 });
    expect(capability.canReadJsonQueries).toBe(false);
    expect(capability.readJsonQueriesStatus).toBe('read_capability_unconfirmed');

    const sentBeforeRead = service.sentMessages.length;
    const result = await client.requestJson('/eos/get/cue', { timeoutMs: 10 });

    expect(result.status).toBe('read_capability_unconfirmed');
    expect(result.error).toContain('Reconfigurez OSC');
    expect(service.sentMessages).toHaveLength(sentBeforeRead);
  });

  it('expose les diagnostics enrichis pour timeout, payload texte, payload vide et JSON invalide', async () => {
    const timeoutService = new FakeOscService();
    const timeoutClient = new OscClient(timeoutService, { defaultTimeoutMs: 20 });

    const timeoutResult = await timeoutClient.requestJson('/eos/get/cue', { timeoutMs: 20 });
    expect(timeoutResult).toMatchObject({
      status: 'timeout',
      diagnostics: {
        requestAddress: '/eos/get/cue',
        responseAddress: null,
        acceptedResponseAddresses: ['/eos/get/cue'],
        transportType: 'udp',
        timeoutMs: 20,
        payloadType: 'empty',
        rawPayloadExcerpt: '',
        handshakeStatus: null,
        protocolMode: null
      }
    });

    const cases = [
      { name: 'texte', value: 'not json', payloadType: 'plain_text', excerpt: 'not json' },
      { name: 'vide', value: '', payloadType: 'empty', excerpt: '' },
      { name: 'json invalide', value: '{"status":', payloadType: 'invalid_json', excerpt: '{"status":' }
    ] as const;

    for (const testCase of cases) {
      const service = new FakeOscService();
      const client = new OscClient(service);
      const responsePromise = client.requestJson('/eos/get/cue', { timeoutMs: 75 });
      await waitFor(() => service.sentMessages.length >= 1);

      service.emit({
        address: '/eos/get/cue',
        args: [{ type: 's', value: testCase.value }]
      });

      const result = await responsePromise;
      expect(result.status).toBe('error');
      expect(result.diagnostics).toMatchObject({
        requestAddress: '/eos/get/cue',
        responseAddress: '/eos/get/cue',
        acceptedResponseAddresses: ['/eos/get/cue'],
        transportType: 'udp',
        timeoutMs: 75,
        payloadType: testCase.payloadType,
        rawPayloadExcerpt: testCase.excerpt,
        handshakeStatus: null,
        protocolMode: null
      });
      expect(result.error).toBeDefined();
    }
  });

  it('normalise une reponse JSON invalide en erreur diagnostiquee', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: [{ type: 's', value: '{"status":' }]
    });

    const result = await responsePromise;

    expect(result).toMatchObject({
      status: 'error',
      data: null,
      diagnostics: {
        requestAddress: '/eos/get/cue',
        responseAddress: '/eos/get/cue',
        acceptedResponseAddresses: ['/eos/get/cue'],
        payloadType: 'invalid_json',
        rawPayloadExcerpt: '{"status":'
      }
    });
    expect(result.error).toContain('Payload JSON invalide');
  });

  it('normalise un payload JSON vide en erreur explicite', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: []
    });

    const result = await responsePromise;

    expect(result.status).toBe('error');
    expect(result.diagnostics?.payloadType).toBe('empty');
    expect(result.error).toContain('Payload vide');
  });

  it('normalise un tableau JSON en erreur de format', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: [{ type: 's', value: JSON.stringify([{ status: 'ok' }]) }]
    });

    const result = await responsePromise;

    expect(result.status).toBe('error');
    expect(result.data).toEqual([{ status: 'ok' }]);
    expect(result.diagnostics?.payloadType).toBe('json');
    expect(result.error).toContain('objet JSON avec un champ status');
  });

  it('normalise un objet JSON sans status en erreur explicite', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: [{ type: 's', value: JSON.stringify({ label: 'Intro' }) }]
    });

    const result = await responsePromise;

    expect(result.status).toBe('error');
    expect(result.data).toEqual({ label: 'Intro' });
    expect(result.error).toContain('sans champ status');
  });

  it('normalise un statut OSC inconnu en erreur explicite', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: [{ type: 's', value: JSON.stringify({ status: 'mystery' }) }]
    });

    const result = await responsePromise;

    expect(result.status).toBe('error');
    expect(result.error).toContain("Statut OSC inconnu 'mystery'");
  });

  it('remonte les messages d erreur imbriques des reponses JSON', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const responsePromise = client.requestJson('/eos/get/cue');
    await waitFor(() => service.sentMessages.length >= 1);

    service.emit({
      address: '/eos/get/cue',
      args: [
        {
          type: 's',
          value: JSON.stringify({ status: 'error', error: { message: 'Cue introuvable' } })
        }
      ]
    });

    const result = await responsePromise;

    expect(result.status).toBe('error');
    expect(result.error).toContain('Cue introuvable');
    expect(result.diagnostics).toMatchObject({
      requestAddress: '/eos/get/cue',
      responseAddress: '/eos/get/cue',
      payloadType: 'json'
    });
  });

  it('respecte la limite de concurrence configuree', async () => {
    const service = new FakeOscService();
    service.delayMs = 10;
    const client = new OscClient(service, { requestConcurrency: 2, queueTimeoutMs: 100 });

    await Promise.all([
      client.sendMessage('/test/a'),
      client.sendMessage('/test/b'),
      client.sendMessage('/test/c'),
      client.sendMessage('/test/d')
    ]);

    expect(service.sentMessages).toHaveLength(4);
    expect(service.maxActiveSends).toBeLessThanOrEqual(2);
  });

  it('segmente la file par cible et preference de transport', async () => {
    const service = new FakeOscService();
    service.delayMs = 20;
    const client = new OscClient(service, { requestConcurrency: 1, queueTimeoutMs: 100 });

    const first = client.sendMessage('/test/target-a-1', [], {
      targetAddress: '10.0.0.1',
      targetPort: 3032,
      transportPreference: 'reliability'
    });
    const second = client.sendMessage('/test/target-a-2', [], {
      targetAddress: '10.0.0.1',
      targetPort: 3032,
      transportPreference: 'reliability'
    });
    const third = client.sendMessage('/test/target-b', [], {
      targetAddress: '10.0.0.2',
      targetPort: 3033,
      transportPreference: 'speed'
    });

    await waitFor(() => service.sentMessages.length >= 2);

    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/test/target-a-1',
      '/test/target-b'
    ]);
    expect(service.sendOptions[0]).toMatchObject({
      targetAddress: '10.0.0.1',
      targetPort: 3032,
      transportPreference: 'reliability'
    });
    expect(service.sendOptions[1]).toMatchObject({
      targetAddress: '10.0.0.2',
      targetPort: 3033,
      transportPreference: 'speed'
    });
    expect(client.getQueueDiagnostics()).toMatchObject({
      pending: 1,
      activeCount: 2,
      concurrency: 1
    });

    await Promise.all([first, second, third]);
    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/test/target-a-1',
      '/test/target-b',
      '/test/target-a-2'
    ]);
  });

  it('serialise les commandes sensibles par cible meme avec une concurrence superieure a 1', async () => {
    const service = new FakeOscService();
    service.delayMs = 20;
    const client = new OscClient(service, { requestConcurrency: 2, queueTimeoutMs: 100 });

    const first = client.sendCommand('Chan 1');
    const second = client.sendNewCommand('Chan 2');
    const read = client.sendMessage('/eos/get/cue');

    await waitFor(() => service.sentMessages.length >= 2);

    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/eos/cmd',
      '/eos/get/cue'
    ]);
    expect(client.getQueueDiagnostics().targets[0]?.activeFamilies).toContain('command-line');

    await Promise.all([first, second, read]);
    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/eos/cmd',
      '/eos/get/cue',
      '/eos/newcmd'
    ]);
  });

  it('declenche un timeout si la console ne repond pas avant la limite', async () => {
    const service = new FakeOscService();
    service.delayMs = 50;
    const client = new OscClient(service, { requestConcurrency: 1, queueTimeoutMs: 10 });

    await expect(client.sendMessage('/test/timeout')).rejects.toMatchObject({
      code: ErrorCode.OSC_TIMEOUT
    });
  });

  it("reessaye le handshake lorsqu'aucun transport n'est encore pret", async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      connectionTimeoutMs: 100
    });

    const manager = gatewayManagers.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const client = new OscClient(gateway);

    const handshakeReply = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/handshake/reply',
          args: [
            {
              type: 's',
              value: 'ETCOSC!'
            },
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
            }
          ]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const protocolReply = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const connectPromise = client.connect({ preferredProtocols: ['tcp', 'udp'] });

    setTimeout(() => {
      manager.ready = true;
      manager.emitStatus({
        type: 'tcp',
        state: 'connected',
        lastHeartbeatAckAt: Date.now(),
        lastHeartbeatSentAt: Date.now(),
        consecutiveFailures: 0
      });

      setTimeout(() => {
        manager.emitMessage('tcp', handshakeReply);

        setTimeout(() => {
          manager.emitMessage('tcp', protocolReply);
        }, 0);
      }, 0);
    }, 0);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('tcp');
    expect(result.protocolStatus).toBe('ok');

    expect(manager.sendCalls.map((call) => decodeOscAddress(call.payload))).toEqual([
      '/eos/handshake',
      '/eos/handshake',
      '/eos/protocol/select'
    ]);
    expect(manager.sendCalls.slice(0, 2).map((call) => decodeOscMessage(call.payload).args)).toEqual([
      [
        { type: 's', value: 'ETCOSC?' },
        { type: 's', value: 'mcp' },
        { type: 's', value: JSON.stringify({ preferredProtocols: ['tcp', 'udp'] }) }
      ],
      [
        { type: 's', value: 'ETCOSC?' },
        { type: 's', value: 'mcp' },
        { type: 's', value: JSON.stringify({ preferredProtocols: ['tcp', 'udp'] }) }
      ]
    ]);

    gateway.close?.();
  });

  it("traite les reponses de handshake contenues dans un bundle apres une commande", async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      connectionTimeoutMs: 100
    });

    const manager = gatewayManagers.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    manager.ready = true;
    const now = Date.now();
    manager.emitStatus({
      type: 'tcp',
      state: 'connected',
      lastHeartbeatAckAt: now,
      lastHeartbeatSentAt: now,
      consecutiveFailures: 0
    });

    const client = new OscClient(gateway);

    const handshakeBundle = Buffer.from(
      osc.writePacket(
        {
          timeTag: osc.timeTag(0),
          packets: [
            {
              address: '/eos/out/cmd',
              args: [
                { type: 's', value: '1' },
                { type: 's', value: 'Hello' }
              ]
            },
            {
              address: '/eos/handshake/reply',
              args: [
                { type: 's', value: 'ETCOSC!' },
                {
                  type: 's',
                  value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
                }
              ]
            }
          ]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const protocolReply = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const received: OscMessage[] = [];
    gateway.onMessage((message) => {
      received.push(message);
    });

    const connectPromise = client.connect({ preferredProtocols: ['tcp', 'udp'] });

    setTimeout(() => {
      manager.emitMessage('tcp', handshakeBundle);

      setTimeout(() => {
        manager.emitMessage('tcp', protocolReply);
      }, 0);
    }, 0);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('tcp');
    expect(result.protocolStatus).toBe('ok');

    expect(received.slice(0, 2)).toEqual([
      {
        address: '/eos/out/cmd',
        args: [
          { type: 's', value: '1' },
          { type: 's', value: 'Hello' }
        ]
      },
      {
        address: '/eos/handshake/reply',
        args: [
          { type: 's', value: 'ETCOSC!' },
          {
            type: 's',
            value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
          }
        ]
      }
    ]);
    expect(received.map((message) => message.address)).toContain('/eos/handshake/reply');

    gateway.close?.();
  });


  it('bloque les endpoints non autorises lorsque EOS_STRICT_MODE est actif', async () => {
    process.env.EOS_STRICT_MODE = 'true';
    const service = new FakeOscService();
    const client = new OscClient(service);

    await expect(client.sendMessage('/eos/get/patch/chan_pos')).rejects.toThrow(/EOS_STRICT_MODE bloque/);
    expect(service.sentMessages).toHaveLength(0);
  });

  it("continue d'autoriser les commandes officielles lorsque EOS_STRICT_MODE est actif", async () => {
    process.env.EOS_STRICT_MODE = 'true';
    const service = new FakeOscService();
    const client = new OscClient(service);

    await client.sendCommand('Chan 1 At 50');

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('propage le correlationId du contexte vers les envois OSC', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    await runWithRequestContext({ correlationId: 'corr-123' }, async () => {
      await client.sendCommand('Chan 1 At 50', { user: 3 });
    });

    expect(service.sendOptions[0]).toMatchObject({ correlationId: 'corr-123' });
  });
});
