/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { UDPPort, readPacket } from 'osc';
import { getResourceCache } from '../../cache/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../client';
import { OscService, type OscMessage } from '../index';
import { eosPingTool } from '../../../tools/connection/eos_ping';
import { eosGroupGetInfoTool } from '../../../tools/groups/index';
import { eosGetCommandLineTool } from '../../../tools/commands/command_tools';
import { getStructuredContent, runTool } from '../../../tools/__tests__/helpers/runTool';

type ToolName = 'eos_ping' | 'eos_group_get_info' | 'eos_get_command_line';

interface FrameFixture {
  source: string;
  hex: string;
  decoded: OscMessage;
}

interface ConformanceScenario {
  id: string;
  family: string;
  tool: ToolName;
  toolArgs: Record<string, unknown>;
  requestFrame: FrameFixture;
  responseFrame: FrameFixture;
  expectedStructuredContent: Record<string, unknown>;
}

const toolByName = {
  eos_ping: eosPingTool,
  eos_group_get_info: eosGroupGetInfoTool,
  eos_get_command_line: eosGetCommandLineTool
} as const;

describe('EOS OSC conformance integration (captured frames)', () => {
  jest.setTimeout(10_000);

  async function getAvailablePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo | string | null;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          if (!address || typeof address === 'string') {
            reject(new Error('Unable to determine dynamic port'));
            return;
          }
          resolve(address.port);
        });
      });
    });
  }

  function waitForPortReady(port: UDPPort): Promise<void> {
    return new Promise((resolve) => {
      if ((port as unknown as { socket?: { listening: boolean } }).socket?.listening) {
        resolve();
        return;
      }
      port.on('ready', () => resolve());
    });
  }

  function decodeHexFrame(hex: string): OscMessage {
    const packet = readPacket(Buffer.from(hex, 'hex'), { metadata: true }) as OscMessage;
    return {
      address: packet.address,
      args: Array.isArray(packet.args) ? packet.args : []
    };
  }

  const fixturePath = join(__dirname, 'fixtures', 'eos-conformance.frames.json');
  const scenarios = JSON.parse(readFileSync(fixturePath, 'utf8')) as ConformanceScenario[];

  class OscServiceGatewayAdapter implements OscGateway {
    constructor(private readonly service: OscService) {}

    public send(message: OscMessage, options?: OscGatewaySendOptions): Promise<void> {
      return this.service.send(message, options?.targetAddress, options?.targetPort);
    }

    public onMessage(listener: (message: OscMessage) => void): () => void {
      return this.service.onMessage(listener);
    }
  }

  let oscService: OscService | undefined;
  let consoleEmulator: UDPPort | undefined;

  afterEach(() => {
    consoleEmulator?.close();
    oscService?.close();
    setOscClient(null);
    getResourceCache().clearAll();
    consoleEmulator = undefined;
    oscService = undefined;
  });

  test.each(scenarios)('$id [$family]', async (scenario) => {
    const servicePort = await getAvailablePort();
    const consolePort = await getAvailablePort();

    oscService = new OscService({
      localAddress: '127.0.0.1',
      localPort: servicePort,
      remoteAddress: '127.0.0.1',
      remotePort: consolePort
    });
    const client = new OscClient(new OscServiceGatewayAdapter(oscService), { defaultTimeoutMs: 1_000 });
    setOscClient(client);

    consoleEmulator = new UDPPort({
      localAddress: '127.0.0.1',
      localPort: consolePort,
      remoteAddress: '127.0.0.1',
      remotePort: servicePort,
      metadata: true
    });
    consoleEmulator.open();
    await waitForPortReady(consoleEmulator);

    const expectedRequestFromCapture = decodeHexFrame(scenario.requestFrame.hex);
    const expectedResponseFromCapture = decodeHexFrame(scenario.responseFrame.hex);

    expect(expectedRequestFromCapture).toEqual(scenario.requestFrame.decoded);
    expect(expectedResponseFromCapture).toEqual(scenario.responseFrame.decoded);

    const seenRequest = new Promise<OscMessage>((resolve) => {
      consoleEmulator!.once('message', (incoming: OscMessage) => {
        resolve(incoming);
      });
    });

    const toolPromise = runTool(toolByName[scenario.tool], scenario.toolArgs);
    const outgoing = await seenRequest;

    expect(outgoing.address).toBe(scenario.requestFrame.decoded.address);
    expect(outgoing.args).toEqual(scenario.requestFrame.decoded.args);

    const outgoingTypes = (outgoing.args ?? []).map((arg) => arg.type);
    const fixtureTypes = (scenario.requestFrame.decoded.args ?? []).map((arg) => arg.type);
    expect(outgoingTypes).toEqual(fixtureTypes);

    consoleEmulator.send(scenario.responseFrame.decoded);

    const result = await toolPromise;
    const structuredContent = getStructuredContent(result);

    expect(structuredContent).toBeDefined();
    expect(structuredContent).toMatchObject(scenario.expectedStructuredContent);
  });
});
