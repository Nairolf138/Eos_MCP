import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { UDPPort } from 'osc';
import { OscService } from '../index';
import type { OscMessage } from '../index';

describe('OscService integration (UDP sockets)', () => {
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

  let service: OscService | undefined;
  const resources: Array<{ close: () => void }> = [];

  afterEach(() => {
    resources.splice(0).forEach((resource) => {
      try {
        resource.close();
      } catch (_error) {
        // Ignore cleanup errors in tests
      }
    });
    service?.close();
    service = undefined;
  });

  test('sends OSC messages using real UDP sockets', async () => {
    const remotePort = await getAvailablePort();
    const receiver = new UDPPort({
      localAddress: '127.0.0.1',
      localPort: remotePort,
      metadata: true
    });
    receiver.open();
    resources.push({ close: () => receiver.close() });
    await waitForPortReady(receiver);

    const servicePort = await getAvailablePort();
    service = new OscService({
      localAddress: '127.0.0.1',
      localPort: servicePort,
      remoteAddress: '127.0.0.1',
      remotePort
    });

    const serviceUdp = (service as unknown as { port: UDPPort }).port;
    await waitForPortReady(serviceUdp);

    const received = new Promise<OscMessage>((resolve) => {
      receiver.once('message', (message: OscMessage) => {
        resolve(message);
      });
    });

    const message: OscMessage = {
      address: '/integration/send',
      args: [
        { type: 'i', value: 42 },
        { type: 's', value: 'hello' }
      ]
    };

    await service.send(message);

    const payload = await received;
    expect(payload.address).toBe(message.address);
    expect(payload.args).toEqual(message.args);
  });

  test('emits received OSC messages via onMessage listener', async () => {
    const servicePort = await getAvailablePort();
    const remotePort = await getAvailablePort();

    service = new OscService({
      localAddress: '127.0.0.1',
      localPort: servicePort,
      remoteAddress: '127.0.0.1',
      remotePort
    });

    const serviceUdp = (service as unknown as { port: UDPPort }).port;
    await waitForPortReady(serviceUdp);

    const sender = new UDPPort({
      localAddress: '127.0.0.1',
      localPort: remotePort,
      remoteAddress: '127.0.0.1',
      remotePort: servicePort,
      metadata: true
    });
    sender.open();
    resources.push({ close: () => sender.close() });
    await waitForPortReady(sender);

    const received = new Promise<OscMessage>((resolve) => {
      const dispose = service!.onMessage((message) => {
        dispose();
        resolve(message);
      });
    });

    const message: OscMessage = {
      address: '/integration/receive',
      args: [
        { type: 'f', value: 1.5 },
        { type: 'T', value: true }
      ]
    };

    sender.send(message);

    const payload = await received;
    expect(payload.address).toBe(message.address);
    expect(payload.args).toEqual(message.args);
  });
});
