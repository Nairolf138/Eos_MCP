import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosChannelSetLevelTool,
  eosSetDmxTool,
  eosChannelGetInfoTool
} from '../index';
import { getStructuredContent, isTextContent, runTool } from '../../__tests__/helpers/runTool';

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
    this.sentMessages.push(message);
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
}

describe('channel tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('convertit le mot-cle out en niveau 0 avant envoi', async () => {
    await runTool(eosChannelSetLevelTool, { channels: [1, 2], level: 'out' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.channels.command });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 2 Sneak 0 Enter');
  });

  it('accepte les numeros de canal fournis en chaine', async () => {
    await runTool(eosChannelSetLevelTool, { channels: ['001', '002'], level: 50 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.channels.command });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 2 Sneak 50 Enter');
  });

  it('transforme full en 255 pour le DMX', async () => {
    await runTool(eosSetDmxTool, { addresses: [101], value: 'full' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.dmx.command });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Address 101 At 255 Enter');
  });

  it('accepte les adresses DMX en chaine', async () => {
    await runTool(eosSetDmxTool, { addresses: ['010', '011'], value: 10 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.dmx.command });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Address 10 Thru 11 At 10 Enter');
  });

  describe('eos_channel_get_info', () => {
    it('structure la reponse quand tous les canaux sont presentes', async () => {
      const promise = runTool(eosChannelGetInfoTool, { channels: [1, 2], fields: ['label'] });

      queueMicrotask(() => {
        service.emit({
          address: oscMappings.channels.info,
          args: [
            {
              type: 's',
              value: JSON.stringify({
                status: 'ok',
                channels: [
                  { id: 1, label: 'Front' },
                  { id: 2, label: 'Back' }
                ]
              })
            }
          ]
        });
      });

      const result = await promise;
      const structuredContent = getStructuredContent(result);
      expect(structuredContent).toBeDefined();
      if (!structuredContent) {
        throw new Error('Expected structured content');
      }

      expect(structuredContent).toMatchObject({
        status: 'ok',
        request: { channels: [1, 2], fields: ['label'] },
        channels: [
          { channel: 1, exists: true, info: { id: 1, label: 'Front' } },
          { channel: 2, exists: true, info: { id: 2, label: 'Back' } }
        ],
        summary: { requested: 2, found: 2, missing: 0 }
      });

      const textEntry = result.content.find(isTextContent);
      expect(textEntry?.text).toBe('Informations recues pour 2 canaux.');
    });

    it('indique les canaux manquants lorsque la reponse est partielle', async () => {
      const promise = runTool(eosChannelGetInfoTool, { channels: [1, 2] });

      queueMicrotask(() => {
        service.emit({
          address: oscMappings.channels.info,
          args: [
            {
              type: 's',
              value: JSON.stringify({
                status: 'ok',
                channels: [
                  { id: 1, label: 'Front' }
                ]
              })
            }
          ]
        });
      });

      const result = await promise;
      const structuredContent = getStructuredContent(result);
      expect(structuredContent).toBeDefined();
      if (!structuredContent) {
        throw new Error('Expected structured content');
      }

      expect(structuredContent).toMatchObject({
        channels: [
          { channel: 1, exists: true, info: { id: 1, label: 'Front' } },
          { channel: 2, exists: false, info: null }
        ],
        summary: { requested: 2, found: 1, missing: 1 }
      });

      const textEntry = result.content.find(isTextContent);
      expect(textEntry?.text).toBe('Informations recues pour 1 canal. 1 canal introuvable.');
    });

    it("signale l'absence de donnees quand aucun canal n'est renvoye", async () => {
      const promise = runTool(eosChannelGetInfoTool, { channels: [5, 6] });

      queueMicrotask(() => {
        service.emit({
          address: oscMappings.channels.info,
          args: [
            {
              type: 's',
              value: JSON.stringify({
                status: 'ok',
                channels: []
              })
            }
          ]
        });
      });

      const result = await promise;
      const structuredContent = getStructuredContent(result);
      expect(structuredContent).toBeDefined();
      if (!structuredContent) {
        throw new Error('Expected structured content');
      }

      expect(structuredContent).toMatchObject({
        channels: [
          { channel: 5, exists: false, info: null },
          { channel: 6, exists: false, info: null }
        ],
        summary: { requested: 2, found: 0, missing: 2 }
      });

      const textEntry = result.content.find(isTextContent);
      expect(textEntry?.text).toBe("Aucun des 2 canaux demandes n'a ete trouve.");
    });
  });
});
