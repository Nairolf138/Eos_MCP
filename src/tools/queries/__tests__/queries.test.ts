/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { getResourceCache } from '../../../services/cache/index';
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import eosPayloadVariants from '../../../services/osc/__tests__/fixtures/eos-query-payload-variants.json';
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

function emitJson(service: FakeOscService, address: string, payload: unknown): void {
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



  it('accepte les variantes EOS scalaires pour les comptes', async () => {
    const numericPromise = runTool(eosGetCountTool, { target_type: 'group' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.group.count,
        args: [{ type: 's', value: JSON.stringify(eosPayloadVariants.counts.numericScalar) }]
      });
    });

    expect(getStructuredContent(await numericPromise)).toMatchObject({
      action: 'get_count',
      status: 'ok',
      target_type: 'group',
      count: 7
    });

    const stringPromise = runTool(eosGetCountTool, { target_type: 'preset' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.preset.count,
        args: [{ type: 's', value: JSON.stringify(eosPayloadVariants.counts.numericString) }]
      });
    });

    expect(getStructuredContent(await stringPromise)).toMatchObject({
      action: 'get_count',
      status: 'ok',
      target_type: 'preset',
      count: 12
    });
  });

  it('accepte les variantes EOS directes pour les listes', async () => {
    const directArrayPromise = runTool(eosGetListAllTool, { target_type: 'cue' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.cue.list,
        args: [{ type: 's', value: JSON.stringify(eosPayloadVariants.lists.directArray) }]
      });
    });

    expect(getStructuredContent(await directArrayPromise)).toMatchObject({
      action: 'list_all',
      status: 'ok',
      target_type: 'cue',
      items: [
        { number: '1', uid: 'cue:1', label: 'Intro' },
        { number: '2', uid: 'cue:2', label: 'Blackout' }
      ]
    });

    const listObjectPromise = runTool(eosGetListAllTool, { target_type: 'macro' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.macro.list,
        args: [{ type: 's', value: JSON.stringify(eosPayloadVariants.lists.objectWithList) }]
      });
    });

    expect(getStructuredContent(await listObjectPromise)).toMatchObject({
      action: 'list_all',
      status: 'ok',
      target_type: 'macro',
      items: [{ number: '10', uid: 'macro:10', label: 'Preset Reset' }]
    });

    const parallelPromise = runTool(eosGetListAllTool, { target_type: 'preset' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.queries.preset.list,
        args: [{ type: 's', value: JSON.stringify(eosPayloadVariants.lists.objectWithParallelArrays) }]
      });
    });

    expect(getStructuredContent(await parallelPromise)).toMatchObject({
      action: 'list_all',
      status: 'ok',
      target_type: 'preset',
      items: [
        { number: '1', uid: 'preset:1', label: 'Warm' },
        { number: '2', uid: 'preset:2', label: 'Cool' }
      ]
    });
  });

  it('propage les diagnostics OSC et le message console pour timeout, payload texte, payload vide et JSON invalide', async () => {
    const timeoutResult = await runTool(eosGetCountTool, { target_type: 'group', timeoutMs: 50 });
    const timeoutContent = getStructuredContent(timeoutResult);
    expect(timeoutContent).toMatchObject({
      action: 'get_count',
      status: 'timeout',
      target_type: 'group',
      diagnostics: {
        requestAddress: oscMappings.queries.group.count,
        responseAddress: null,
        timeoutMs: 50,
        payloadType: 'empty'
      }
    });
    expect(timeoutResult.content?.[0]?.type).toBe('text');
    expect(timeoutResult.content?.[0]?.text).toContain('OSC RX activé');

    const cases = [
      { target: 'macro', value: 'not json', payloadType: 'plain_text' },
      { target: 'preset', value: '', payloadType: 'empty' },
      { target: 'fx', value: '{"status":', payloadType: 'invalid_json' }
    ] as const;

    for (const testCase of cases) {
      const mapping = oscMappings.queries[testCase.target];
      const promise = runTool(eosGetListAllTool, { target_type: testCase.target, timeoutMs: 50 });

      queueMicrotask(() => {
        service.emit({
          address: mapping.list,
          args: [{ type: 's', value: testCase.value }]
        });
      });

      const result = await promise;
      const structuredContent = getStructuredContent(result);
      expect(structuredContent).toMatchObject({
        action: 'list_all',
        status: 'error',
        target_type: testCase.target,
        diagnostics: {
          requestAddress: mapping.list,
          responseAddress: mapping.list,
          timeoutMs: 50,
          payloadType: testCase.payloadType
        }
      });
      expect(result.content?.[0]?.text).toContain('ports UDP 8000/8001 ou TCP 3032 cohérents');
    }
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
      confidence: 'none',
      is_complete: false,
      data: null,
      osc: {
        address: oscMappings.queries.group.count,
        args: {}
      }
    });
    expect(structuredContent.count).toBeUndefined();
    expect(structuredContent.next_operator_actions).toEqual(expect.any(Array));
    expect(typeof structuredContent.error).toBe('string');
  });
});
