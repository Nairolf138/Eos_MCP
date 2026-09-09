/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient } from '../client';
import { OscConnectionGateway } from '../gateway';
import { NativeLoopbackPeer } from './fixtures/nativeLoopback';

describe('ETC native OSC integration on real UDP/TCP sockets (synthetic peer)', () => {
 let peer: NativeLoopbackPeer; let gateway: OscConnectionGateway; let client: OscClient;
 beforeEach(async()=>{
  peer=new NativeLoopbackPeer(); await peer.start();
  gateway=new OscConnectionGateway({host:'127.0.0.1',tcpPort:peer.tcpPort,udpPort:peer.udpPort,localAddress:'127.0.0.1',localPort:0,connectionTimeoutMs:1000,heartbeatIntervalMs:10000});
  client=new OscClient(gateway,{defaultTimeoutMs:1000});
 });
 afterEach(async()=>{client.dispose();gateway.close();await peer.close();});
 test.each(['speed','reliability'] as const)('%s: native version, typed resources, count/index and ping echo',async(preference)=>{
  const options={transportPreference:preference};
  await expect(client.ping({...options,message:'error'})).resolves.toMatchObject({status:'ok',echo:'error'});
  await expect(client.requestJson('/eos/get/version',options)).resolves.toMatchObject({status:'ok',data:{version:'3.3.6 Build 14'}});
  await expect(client.requestJson('/eos/get/group/7',options)).resolves.toMatchObject({status:'ok',data:{channels:[101,102]}});
  await expect(client.requestJson('/eos/get/patch/101/1',options)).resolves.toMatchObject({status:'ok',data:{address:513,ending_address:513}});
  await expect(client.requestJson('/eos/get/cue/2/12.5/0',options)).resolves.toMatchObject({status:'ok',data:{cue:12.5,timings:{up:{time:2.5}}}});
  await expect(client.requestJson('/eos/get/sub/7',options)).resolves.toMatchObject({status:'ok',data:{priority:'P3'}});
  await expect(client.requestJson('/eos/get/group/index/{index}',options)).resolves.toMatchObject({status:'ok',data:{items:[{number:7}]}});
  const queries=peer.received.filter(entry=>entry.message.address.startsWith('/eos/get/'));
  expect(queries.every(entry=>entry.transport === (preference==='speed'?'udp':'tcp'))).toBe(true);
  expect(queries.every(entry=>entry.message.args?.length===0)).toBe(true);
  expect(peer.received.some(entry=>/handshake|protocol|\/list$/.test(entry.message.address))).toBe(false);
 });
 test('an explicit alternate console is reached instead of reusing the default TCP socket',async()=>{
  const other=new NativeLoopbackPeer(); await other.start();
  try {
   await client.ping({message:'default'});
   await expect(client.ping({message:'alternate',targetAddress:'127.0.0.1',targetPort:other.udpPort,transportPreference:'reliability'})).resolves.toMatchObject({status:'ok',echo:'alternate'});
   expect(other.received.some(entry=>entry.message.args?.[0]?.value==='alternate')).toBe(true);
   expect(peer.received.some(entry=>entry.message.args?.[0]?.value==='alternate')).toBe(false);
  } finally {await other.close();}
 });
 test('an absent section times out instead of accepting an incomplete object',async()=>{
  const native=peer.respond; peer.respond=(request)=>native(request).filter(message=>!message.address.includes('/channels/'));
  await expect(client.requestJson('/eos/get/group/7',{timeoutMs:100})).resolves.toMatchObject({status:'timeout',data:null});
 });
});
