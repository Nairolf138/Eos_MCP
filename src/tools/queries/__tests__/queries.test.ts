/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { getResourceCache } from '../../../services/cache/index';
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import { eosGetCountTool, eosGetListAllTool } from '../index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

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

const QUERY_TARGET_TYPES = [
  'cue',
  'cuelist',
  'group',
  'macro',
  'ms',
  'ip',
  'fp',
  'cp',
  'bp',
  'preset',
  'sub',
  'fx',
  'curve',
  'snap',
  'pixmap'
] as const;

function emitJson(service: FakeOscService, address: string, payload: Record<string, unknown>): void {
  service.emit({
    address,
    args: [
      {
        type: 's',
        value: JSON.stringify(payload)
      }
    ]
  });
}

describe('query tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    getResourceCache().clearAll();
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
    getResourceCache().clearAll();
  });

  it('autorise requestJson pour les endpoints count et list de chaque target_type', async () => {
    for (const targetType of QUERY_TARGET_TYPES) {
      const mapping = oscMappings.queries[targetType];
      const countPromise = runTool(eosGetCountTool, { target_type: targetType });

      queueMicrotask(() => {
        expect(service.sentMessages.at(-1)).toMatchObject({ address: mapping.count });
        emitJson(service, mapping.count, { status: 'ok', count: 1 });
      });

      const countContent = getStructuredContent(await countPromise);
      expect(countContent).toMatchObject({
        action: 'get_count',
        status: 'ok',
        target_type: targetType,
        count: 1
      });

      const listPromise = runTool(eosGetListAllTool, { target_type: targetType });

      queueMicrotask(() => {
        expect(service.sentMessages.at(-1)).toMatchObject({ address: mapping.list });
        emitJson(service, mapping.list, {
          status: 'ok',
          items: [{ number: 1, uid: `${targetType}:1`, label: targetType }]
        });
      });

      const listContent = getStructuredContent(await listPromise);
      expect(listContent).toMatchObject({
        action: 'list_all',
        status: 'ok',
        target_type: targetType,
        items: [{ number: '1', uid: `${targetType}:1`, label: targetType }]
      });
    }
  });

  it('envoie la requete de count vers le mapping FX et normalise la reponse', async () => {
    const promise = runTool(eosGetCountTool, { target_type: 'FX' });

    queueMicrotask(() => {
      expect(service.sentMessages).toHaveLength(1);
      expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.queries.fx.count });

      service.emit({
        address: oscMappings.queries.fx.count,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', count: '7' })
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
      action: 'get_count',
      status: 'ok',
      target_type: 'fx',
      count: 7
    });
  });

  it('normalise la liste de cues a partir de tableaux separes', async () => {
    const promise = runTool(eosGetListAllTool, { target_type: 'cue' });

    queueMicrotask(() => {
      expect(service.sentMessages).toHaveLength(1);
      expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.queries.cue.list });

      service.emit({
        address: oscMappings.queries.cue.list,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              numbers: ['1', '2.5'],
              uids: ['1/1', '1/2'],
              labels: ['Intro', null]
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
      action: 'list_all',
      status: 'ok',
      target_type: 'cue',
      items: [
        { number: '1', uid: '1/1', label: 'Intro' },
        { number: '2.5', uid: '1/2', label: null }
      ]
    });
  });

  it('normalise la liste de macros a partir dun dictionnaire', async () => {
    const promise = runTool(eosGetListAllTool, { target_type: 'macro', timeoutMs: 100 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.macro.list,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              macros: {
                '1': { uid: 'macro:1', label: 'Premier' },
                '2': 'Second'
              }
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
      action: 'list_all',
      status: 'ok',
      target_type: 'macro',
      items: [
        { number: '1', uid: 'macro:1', label: 'Premier' },
        { number: '2', uid: '2', label: 'Second' }
      ]
    });
  });

  it('supporte la recuperation de magic sheets avec structure items', async () => {
    const promise = runTool(eosGetListAllTool, { target_type: 'MS' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.ms.list,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              items: [
                { number: 1, uid: 'ms:1', label: 'Layout' },
                { number: 2, uid: 'ms:2' }
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
      target_type: 'ms',
      items: [
        { number: '1', uid: 'ms:1', label: 'Layout' },
        { number: '2', uid: 'ms:2', label: null }
      ]
    });
  });

  it('retourne un structuredContent timeout quand aucune reponse OSC narrive', async () => {
    const result = await runTool(eosGetCountTool, { target_type: 'group', timeoutMs: 50 });
    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }

    expect(structuredContent).toMatchObject({
      action: 'get_count',
      status: 'timeout',
      target_type: 'group',
      count: 0,
      data: null,
      osc: {
        address: oscMappings.queries.group.count,
        args: {}
      }
    });
    expect(typeof structuredContent.error).toBe('string');
  });
});
