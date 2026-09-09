/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { getResourceCache } from '../../../services/cache';
import type { OscMessage } from '../../../services/osc/index';
import { frame } from '../../../services/osc/__tests__/fixtures/nativePeer';
import { eosGetCountTool, eosGetListAllTool } from '../index';

describe('Native query counts and failures', () => {
 let messages: OscMessage[]; let answer: boolean; let listeners: Set<(message:OscMessage)=>void>;
 beforeEach(() => {
  getResourceCache().clearAll(); messages=[]; answer=true; listeners=new Set();
  const peer: OscGateway = {
   async send(message) { messages.push(message); if(answer) for(const listener of listeners) listener(frame(message.address.replace('/eos/get/','/eos/out/get/'),[7])); },
   onMessage(listener) { listeners.add(listener); return ()=>{listeners.delete(listener);}; }
  };
  setOscClient(new OscClient(peer,{defaultTimeoutMs:30}));
 });
 afterEach(()=>setOscClient(null));
 test.each(['cue','cuelist','group','macro','ms','ip','fp','cp','bp','preset','sub','fx','curve','snap','pixmap'])('reads a native integer count for %s',(async (target_type)=>{
  const args={target_type,...(target_type==='cue'?{cuelist_number:2}:{})};
  const result=await eosGetCountTool.handler(args,{});
  expect(result.structuredContent).toMatchObject({status:'ok',count:7});
  expect(messages).toEqual([{address:`/eos/get/${target_type}${target_type==='cue'?'/2':''}/count`,args:[]}]);
 }));
 test('does not infer zero objects from a timeout',async()=>{
  answer=false; const result=await eosGetCountTool.handler({target_type:'group'},{});
  expect(result.structuredContent).toMatchObject({status:'timeout',is_complete:false});
  expect(result.structuredContent?.count).toBeUndefined();
 });
 test('preserves an enumeration failure rather than claiming completeness',async()=>{
  const result=await eosGetListAllTool.handler({target_type:'group'},{});
  expect(result.structuredContent).toMatchObject({status:'timeout',is_complete:false});
 });
 test('rejects an invalid family without traffic',async()=>{
  await expect(eosGetCountTool.handler({target_type:'invented'},{})).rejects.toThrow(); expect(messages).toEqual([]);
 });
});
