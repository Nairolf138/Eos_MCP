/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscMessage } from './index';
import { decodeNativeObject, decodeNativeScalar, NativeListAssembler, oscValues, planNativeQuery, requiredSections, type NativeQueryPlan } from './nativeProtocol';
import { OperationLock } from './operationLock';

export interface NativeQueryIo {
  send: (address: string) => Promise<unknown>;
  onMessage: (listener: (message: OscMessage) => void) => () => void;
}
export interface NativeQueryResult {
  status: 'ok' | 'error' | 'timeout';
  data: unknown;
  payload: OscMessage | null;
  error?: string;
  request_address: string;
}

const listKeys: Record<string, string> = { cue: 'cues', cuelist: 'cuelists', group: 'groups', sub: 'submasters', macro: 'macros', ms: 'magic_sheets', fx: 'effects', pixmap: 'pixmaps', patch: 'channels' };
const singularKeys: Record<string, string> = { group: 'group', sub: 'submaster', macro: 'macro', ms: 'magic_sheet', fx: 'effect', pixmap: 'pixmap', snap: 'snapshot', curve: 'curve' };

export class NativeQueryClient {
  private readonly lock = new OperationLock();

  public request(template: string, payload: Record<string, unknown>, timeoutMs: number, io: NativeQueryIo): Promise<NativeQueryResult> {
    // OSC has no request IDs. Only one show query uses this gateway at a time.
    return this.lock.run('queries', async () => {
      try {
        if (Array.isArray(payload.channels)) {
          const channels: unknown[] = [];
          for (const channel of payload.channels) {
            const result = await this.execute(planNativeQuery('/eos/get/patch/{channel}/{part}', { channel, part: 1 }), timeoutMs, io);
            if (result.status !== 'ok') return result;
            channels.push(result.data);
          }
          return { status: 'ok', data: { channels }, payload: null, request_address: '/eos/get/patch/{channel}/{part}' };
        }
        return await this.execute(planNativeQuery(template, payload), timeoutMs, io);
      } catch (error) {
        return { status: 'error', data: null, payload: null, error: error instanceof Error ? error.message : String(error), request_address: template };
      }
    });
  }

  private async execute(plan: NativeQueryPlan, timeoutMs: number, io: NativeQueryIo): Promise<NativeQueryResult> {
    if (plan.kind === 'observe') {
      return { status: 'error', data: null, payload: null, request_address: plan.address, error: 'Cette information est diffusee par Eos; aucune requete /get equivalente n’est documentee. Attendre un evenement OSC recent.' };
    }
    if (plan.kind === 'enumerate') {
      const countAddress = plan.address.replace('/index/{index}', '/count');
      const countResult = await this.exchange({ ...plan, address: countAddress, kind: 'scalar' }, timeoutMs, io);
      if (countResult.status !== 'ok') return countResult;
      const count = Number((countResult.data as { count: number }).count);
      if (count > 10_000) throw new Error('Enumeration trop volumineuse (> 10000 objets). Restreindre la requete.');
      const items: unknown[] = [];
      for (let index = 0; index < count; index++) {
        const item = await this.exchange({ ...plan, address: plan.address.replace('{index}', String(index)), kind: 'resource', index }, timeoutMs, io);
        if (item.status !== 'ok') return { ...item, data: { items, expected_count: count, is_complete: false } };
        items.push(item.data);
      }
      return { status: 'ok', data: { items, [listKeys[plan.family] ?? 'items']: items, count }, payload: null, request_address: plan.address };
    }
    return this.exchange(plan, timeoutMs, io);
  }

  private async exchange(plan: NativeQueryPlan, timeoutMs: number, io: NativeQueryIo): Promise<NativeQueryResult> {
    const expected = plan.address.replace('/eos/get/', '/eos/out/get/');
    const assembler = new NativeListAssembler();
    const sections = new Map<string, unknown[]>();
    const scalar = plan.kind === 'scalar' || plan.family === 'fpe' || plan.address.includes('/augment3d/');
    let base: string | null = plan.index === undefined ? expected : null;
    const familyPrefix = plan.family === 'cue'
      ? `/eos/out/get/cue/${plan.address.split('/')[4]}/`
      : `/eos/out/get/${plan.family}/`;
    let dispose = (): void => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const cleanup = (): void => { if (finished) return; finished = true; if (timer) clearTimeout(timer); dispose(); };
    const response = new Promise<NativeQueryResult>((resolve) => {
      const done = (result: Omit<NativeQueryResult, 'request_address'>): void => { cleanup(); resolve({ ...result, request_address: plan.address }); };
      dispose = io.onMessage((incoming) => {
        if (finished) return;
        if (scalar ? !(incoming.address === expected || incoming.address.startsWith(`${expected}/list/`)) : !incoming.address.startsWith(familyPrefix)) return;
        try {
          const message = assembler.accept(incoming);
          if (!message) return;
          if (scalar) {
            done({ status: 'ok', data: decodeNativeScalar(plan, message), payload: incoming }); return;
          }
          const match = message.address.match(new RegExp(`^(/eos/out/get/${plan.family}/\\d+(?:\\.\\d+)?${plan.family === 'cue' ? '/\\d+(?:\\.\\d+)?/\\d+' : plan.family === 'patch' ? '/\\d+' : ''})(?:/(.*))?$`));
          if (!match) return;
          const values = oscValues(message);
          if (plan.index !== undefined && values[0] !== plan.index) return;
          if (base !== null && base !== match[1]) return;
          base = match[1];
          if (values.length === 0 && !match[2]) {
            done({ status: 'error', data: { exists: false }, payload: incoming, error: `Objet Eos absent: ${base}.` }); return;
          }
          const section = match[2] ?? '';
          sections.set(section, values);
          if (!requiredSections(plan.family).every((key) => sections.has(key))) return;
          const uid = sections.get('')?.[1];
          if ([...sections.values()].some((args) => args[1] !== uid)) throw new Error('UID incoherent entre les fragments de l’objet Eos.');
          const object = decodeNativeObject(plan.family, base, sections);
          const key = singularKeys[plan.family];
          done({ status: 'ok', data: key ? { ...object, [key]: { ...object } } : object, payload: incoming });
        } catch (error) {
          done({ status: 'error', data: null, payload: incoming, error: error instanceof Error ? error.message : String(error) });
        }
      });
      timer = setTimeout(() => done({ status: 'timeout', data: null, payload: null, error: `Reponse OSC absente ou incomplete pour ${plan.address} apres ${timeoutMs} ms.` }), timeoutMs);
    });
    try {
      // The listener and rejection handler exist before sending, including synchronous test gateways.
      const [, result] = await Promise.all([io.send(plan.address), response]);
      return result;
    } finally { cleanup(); }
  }
}
