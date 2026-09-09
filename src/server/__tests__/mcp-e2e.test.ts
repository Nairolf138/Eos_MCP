/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpGateway, type HttpGateway } from '../httpGateway';
import { ToolRegistry } from '../toolRegistry';
import { toolDefinitions } from '../../tools/index';
import { initializeOscClient, setOscClient } from '../../services/osc/client';
import { OscConnectionGateway } from '../../services/osc/gateway';
import { NativeLoopbackPeer } from '../../services/osc/__tests__/fixtures/nativeLoopback';
import { getResourceCache } from '../../services/cache';

// Real MCP SDK client + HTTP server + actual OSC gateway and UDP/TCP sockets.
// The Eos peer provides synthetic reference-based replies; it is not Eos/Nomad.
describe('MCP HTTP end to end with native OSC replies',()=>{
 let peer: NativeLoopbackPeer; let oscGateway: OscConnectionGateway; let http: HttpGateway;
 let sdk: Client; let root: McpServer;
 const originalProfile=process.env.EOS_MCP_ALLOWED_TOOL_PROFILE;
 const originalStrict=process.env.EOS_STRICT_MODE;
 const createServer=()=>{
  const server=new McpServer({name:'eos-native-e2e',version:'1.0.0'});
  const registry=new ToolRegistry(server); registry.registerMany(toolDefinitions); return {server,registry};
 };
 beforeAll(async()=>{
  process.env.EOS_MCP_ALLOWED_TOOL_PROFILE='admin'; delete process.env.EOS_STRICT_MODE;
  peer=new NativeLoopbackPeer(); await peer.start();
  oscGateway=new OscConnectionGateway({host:'127.0.0.1',tcpPort:peer.tcpPort,udpPort:peer.udpPort,localAddress:'127.0.0.1',localPort:0,connectionTimeoutMs:1500,heartbeatIntervalMs:10000});
  initializeOscClient(oscGateway,{defaultTimeoutMs:200});
  const registered=createServer(); root=registered.server;
  http=createHttpGateway(registered.registry,{port:0,host:'127.0.0.1',serverFactory:async()=>createServer().server});
  await http.start();
  sdk=new Client({name:'official-sdk-test-client',version:'1.0.0'});
  await sdk.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.getAddress()!.port}/mcp`)));
 });
 afterAll(async()=>{
  await sdk?.close(); await http?.stop(); await root?.close(); oscGateway?.close(); setOscClient(null); await peer?.close();
  if(originalProfile===undefined)delete process.env.EOS_MCP_ALLOWED_TOOL_PROFILE;else process.env.EOS_MCP_ALLOWED_TOOL_PROFILE=originalProfile;
  if(originalStrict===undefined)delete process.env.EOS_STRICT_MODE;else process.env.EOS_STRICT_MODE=originalStrict;
 });
 beforeEach(()=>{getResourceCache().clearAll();});
 const call=(name:string,args:Record<string,unknown>={},meta?:Record<string,unknown>)=>sdk.callTool({name,arguments:{targetAddress:'127.0.0.1',targetPort:peer.udpPort,...args},...(meta?{_meta:meta}:{})});
 const writes=()=>peer.received.filter(entry=>!entry.message.address.startsWith('/eos/get/') && entry.message.address!=='/eos/ping');
 test('discovers tools, connects with native version, and validates structured read results',async()=>{
  const catalog=await sdk.listTools();
  expect(catalog.tools.map(tool=>tool.name)).toContain('eos_submaster_record');
  expect(catalog.tools.find(tool=>tool.name==='eos_group_get_info')?.annotations?.readOnlyHint).toBe(true);
  const connect=await call('eos_connect');
  expect(connect.structuredContent).toMatchObject({status:'ok',handshake_mode:'native',selectedProtocol:'etc-osc'});
  for(const [name,args] of [
   ['eos_group_get_info',{group_number:7}], ['eos_patch_get_channel_info',{channel_number:101,part_number:1}],
   ['eos_submaster_get_info',{submaster_number:7}], ['eos_get_list_all',{target_type:'group'}],
   ['eos_macro_get_info',{macro_number:7}], ['eos_pixmap_get_info',{pixmap_number:7}]
  ] as Array<[string,Record<string,unknown>]>) {
   const result=await call(name,args); expect(result.isError).not.toBe(true); expect(result.structuredContent?.status).toBe('ok');
  }
  expect(peer.received.some(entry=>/handshake|protocol|\/get\/.*\/list$/.test(entry.message.address))).toBe(false);
 });
 test('dry-run reaches the MCP envelope and emits no OSC mutation',async()=>{
  const before=writes().length;
  const result=await call('eos_channel_set_parameter',{channels:[101],parameter:'Pan',value:-90,dry_run:true});
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({status:'dry_run',verified:false,commandsSent:[]});
  expect(writes()).toHaveLength(before);
 });
 test('missing confirmation prevents a label change; confirmed label is a native string',async()=>{
  const args={palette_type:'cp',palette_number:7,label:'Rouge # Delete Cue 1'};
  const before=writes().length;
  const refused=await call('eos_palette_label_set',args);
  expect(refused.isError).toBe(true); expect(writes()).toHaveLength(before);
  const accepted=await call('eos_palette_label_set',{...args,confirm:true});
  expect(accepted.isError).not.toBe(true);
  expect(writes().at(-1)?.message).toMatchObject({address:'/eos/set/cp/7/label',args:[{type:'s',value:args.label}]});
 });
 test('MCP metadata cannot elevate the role configured by the server',async()=>{
  process.env.EOS_MCP_ALLOWED_TOOL_PROFILE='read_only';
  const before=writes().length;
  try {
   const result=await call('eos_palette_label_set',{palette_type:'cp',palette_number:7,label:'Forbidden',confirm:true},{grantedRole:'admin'});
   expect(result.isError).toBe(true);expect(writes()).toHaveLength(before);
  } finally {process.env.EOS_MCP_ALLOWED_TOOL_PROFILE='admin';}
 });
 test('concurrent users produce atomic user-scoped commands, without global user switching',async()=>{
  const before=writes().length;
  const results=await Promise.all([3,4].map(user=>call('eos_new_command',{command:`Chan ${100+user} At 50`,terminateWithEnter:true,verify_after_send:false,safety_level:'off',confirm:true,user})));
  expect(results.every(result=>!result.isError)).toBe(true);
  const messages=writes().slice(before).map(entry=>entry.message);
  expect(messages.map(message=>message.address)).toEqual(['/eos/user/3/newcmd','/eos/user/4/newcmd']);
  expect(messages.map(message=>message.args?.length)).toEqual([1,1]);
 });
 test('submaster preparation can be inspected with no reads or writes',async()=>{
  const before=peer.received.length;
  const result=await call('eos_submaster_record',{number:12,label:'Faces',channels:'101 Thru 102',level:75,dry_run:true});
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({status:'dry_run',verified:false,commandsSent:[]});
  expect(peer.received).toHaveLength(before);
 });
});
