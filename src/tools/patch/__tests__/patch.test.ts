/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { getResourceCache } from '../../../services/cache/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';
import type { ToolExecutionResult } from '../../types';
import {
    eosPatchGetAugment3dBeamTool,
    eosPatchGetAugment3dPositionTool,
    eosPatchGetChannelInfoTool
} from '../index';

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

function extractStructuredContent(result: ToolExecutionResult): Record<string, unknown> | null {
  return getStructuredContent(result) ?? null;
}

describe('patch tools', () => {
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


  it('retourne la requete patch calculee en dry_run', async () => {
    const result = await runTool(eosPatchGetChannelInfoTool, { channel_number: 101, dry_run: true });
    expect(service.sentMessages).toHaveLength(0);
    expect(extractStructuredContent(result)).toMatchObject({
      action: 'patch_get_channel_info',
      dry_run: true,
      osc: { address: oscMappings.patch.channelInfo }
    });
  });
  it('ne presente pas un timeout comme un patch vide ou verifie', async () => {
    const result = await runTool(eosPatchGetChannelInfoTool, { channel_number: 301, timeoutMs: 50 });
    expect(extractStructuredContent(result)).toMatchObject({status: 'timeout', is_complete: false, confidence: 'none'});
    expect(extractStructuredContent(result)?.channel).toBeUndefined();
    expect(service.sentMessages).toEqual([{address:'/eos/get/patch/301/1',args:[]}]);
  });

  it('refuse une reponse native dont la section principale est mal formee', async () => {
    service.send = async message => {
      service.sentMessages.push(message);
      service.emit({address:'/eos/out/get/patch/302/1',args:[{type:'i',value:-1},{type:'s',value:'uid-302'}]});
      service.emit({address:'/eos/out/get/patch/302/1/notes',args:[{type:'i',value:-1},{type:'s',value:'uid-302'},{type:'s',value:''}]});
    };
    const result = await runTool(eosPatchGetChannelInfoTool, {channel_number:302, part_number:1, timeoutMs:50});
    expect(extractStructuredContent(result)).toMatchObject({status:'error',is_complete:false});
    expect(extractStructuredContent(result)?.channel).toBeUndefined();
  });

  it('valide les numeros de canal et de partie', async () => {
    await expect(runTool(eosPatchGetChannelInfoTool, { channel_number: 0, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dPositionTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dBeamTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
  });
});
