/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient, setOscClient } from '../../../services/osc/client';
import { frame } from '../../../services/osc/__tests__/fixtures/nativePeer';
import { getResourceCache } from '../../../services/cache';
import { runTool } from '../../__tests__/helpers/runTool';
import { eosWorkflowCreateLookTool as look, eosWorkflowCreateCueSeriesTool as series,
  eosWorkflowRehearsalGoSafeTool as rehearsal, eosWorkflowUpdateCueLookTool as update,
  eosWorkflowPatchFixtureTool as patch, eosWorkflowBuildGroupsAndPalettesTool as prepare,
  eosWorkflowPatchScanTool as scan } from '../index';
import { CuePeer } from './fixtures/cuePeer';

// Replaces legacy JSON-over-OSC scenarios. Patch/group/sub execution is also
// covered by native_preparation.test.ts; this suite exercises exported workflows.
describe('Exported workflows with native cue replies', () => {
  let peer: CuePeer;
  const confirmed = {user:3,require_confirmation:true,verification_timeout_ms:50};
  const target = {channels:'101 Thru 102',cuelist_number:2,cue_number:10};
  beforeEach(() => {getResourceCache().clearAll();peer=new CuePeer();setOscClient(new OscClient(peer,{defaultTimeoutMs:50}));});
  afterEach(() => {setOscClient(null);getResourceCache().clearAll();});
  test('creates a look on a free explicit cue, then reads back its native label', async () => {
    const result=await runTool(look,{...target,...confirmed,color_palette:7,cue_label:'Intro'});
    expect(result.structuredContent).toMatchObject({status:'ok',verified:false});
    expect(peer.writes()).toEqual([
      {address:'/eos/user/3/newcmd',args:[{type:'s',value:'Chan 101 Thru 102#'}]},
      {address:'/eos/user/3/newcmd',args:[{type:'s',value:'CP 7#'}]},
      {address:'/eos/user/3/newcmd',args:[{type:'s',value:'Record Cue 2/10#'}]},
      {address:'/eos/set/cue/2/10/label',args:[{type:'s',value:'Intro'}]}
    ]);
    expect(peer.sent.filter(message=>message.address.startsWith('/eos/get/')).every(message=>message.address==='/eos/get/cue/2/10/0')).toBe(true);
  });
  test('previews complete native labels with no reads or writes', async () => {
    const label='Face "Jardin" # Delete Cue 1';
    const result=await runTool(look,{...target,cue_label:label,dry_run:true});
    expect(result.structuredContent).toMatchObject({status:'dry_run',verified:false,commandsSent:[]});
    expect(result.structuredContent?.commands_preview).toContain(`/eos/set/cue/2/10/label ${JSON.stringify(label)}`);
    expect(peer.sent).toEqual([]);
  });
  test('never puts label text into a command line', async () => {
    const label='Face "Jardin" # Delete Cue 1';
    await runTool(look,{...target,...confirmed,cue_label:label});
    expect(peer.cues.get('2/10')).toBe(label);
    expect(peer.writes().filter(message=>message.address.endsWith('/newcmd')).some(message=>String(message.args?.[0]?.value).includes('Delete'))).toBe(false);
  });
  test('refuses real execution without explicit confirmation before reads', async () => {
    const result=await runTool(look,target);
    expect(result.isError).toBe(true);expect(peer.sent).toEqual([]);
    expect(result.structuredContent?.commands_preview).toContain('Record Cue 2/10');
  });
  test.each([{channels:'101',cue_number:10},{...target,cu_number:12}])('rejects ambiguous targets or misspelled arguments: %j', async args=>{
    await expect(runTool(look,{...args,...confirmed})).rejects.toThrow();expect(peer.sent).toEqual([]);
  });
  test('refuses overwriting an existing cue before any write', async () => {
    peer.cues.set('2/10','Existing');
    await expect(runTool(look,{...target,...confirmed})).rejects.toThrow('deja presente');
    expect(peer.writes()).toEqual([]);
  });
  test('does not treat a silent console as an empty cue target', async () => {
    peer.silent=true;
    await expect(runTool(look,{...target,...confirmed})).rejects.toThrow('incomplet');expect(peer.writes()).toEqual([]);
  });
  test('stops when Record is not observed and never replays the write', async () => {
    peer.ignoreRecord=true;
    const result=await runTool(look,{...target,...confirmed,cue_label:'Unwritten'});
    expect(result.structuredContent).toMatchObject({status:'partial_failure',verified:false});
    expect(peer.writes()).toHaveLength(2);
    expect(peer.writes().filter(message=>String(message.args?.[0]?.value).includes('Record'))).toHaveLength(1);
  });
  test('stops when a native label cannot be read back', async () => {
    peer.ignoreLabel=true;
    const result=await runTool(series,{...confirmed,base_cuelist_number:2,looks:[{channels:'101',cue_number:10,cue_label:'Intro'},{channels:'102',cue_number:11}]});
    expect(result.structuredContent?.status).toBe('partial_failure');expect(peer.cues.has('2/11')).toBe(false);
  });
  test('checks every target of a series before its first write', async () => {
    peer.cues.set('2/11','Existing');
    await expect(runTool(series,{...confirmed,base_cuelist_number:2,start_cue_number:10,looks:[{channels:'101'},{channels:'102'}]})).rejects.toThrow('deja presente');
    expect(peer.writes()).toEqual([]);
  });
  test('increments after an explicit cue and applies intensity separately from Record', async () => {
    const result=await runTool(series,{...confirmed,base_cuelist_number:2,start_cue_number:10,looks:[{channels:'101',intensity:75},{channels:'102',cue_number:20.5},{channels:'103'}]});
    expect(result.structuredContent).toMatchObject({status:'ok',verified:false});
    expect([...peer.cues.keys()]).toEqual(['2/10','2/20.5','2/21.5']);
    expect(peer.writes()[0]).toMatchObject({args:[{type:'s',value:'Chan 101 At 75#'}]});
  });
  test.each([
    [{channels:'101',cue_number:5},{channels:'102',cue_number:5}],
    [{channels:'101',intensity:50,level:75}],
    [{channels:'101'},{channels:'102',cue_number:0}]
  ])('validates the whole series before console traffic: %j', async looks=>{
    await expect(runTool(series,{...confirmed,base_cuelist_number:2,looks})).rejects.toThrow();expect(peer.sent).toEqual([]);
  });
  test('stops after a fresh command error before the following Record', async () => {
    peer.rejectCommand='At 75';
    const result=await runTool(series,{...confirmed,base_cuelist_number:2,looks:[{channels:'101',intensity:75}]});
    expect(result.structuredContent?.status).toBe('partial_failure');expect(peer.writes()).toHaveLength(1);
  });
  test('prechecks a recent command line then sends the native cue-list GO', async () => {
    peer.emit(frame('/eos/out/user/3/cmd',['',0]));
    const result=await runTool(rehearsal,{...confirmed,cuelist_number:2});
    expect(result.structuredContent).toMatchObject({status:'ok',verified:false});
    expect(peer.writes()).toEqual([{address:'/eos/cues/2/fire'}]);
  });
  test.each(['busy','silent'])('refuses rehearsal GO on %s command feedback', async kind=>{
    if(kind==='busy')peer.emit(frame('/eos/out/user/3/cmd',['Chan 1',0]));
    const result=await runTool(rehearsal,{...confirmed,cuelist_number:2,precheck_timeout_ms:50});
    expect(result.isError).toBe(true);expect(peer.writes()).toEqual([]);
  });
  test('uses the same explicit list for an authorized rollback after transport failure', async () => {
    peer.emit(frame('/eos/out/user/3/cmd',['',0]));peer.failAddress='/eos/cues/2/fire';
    const result=await runTool(rehearsal,{...confirmed,cuelist_number:2,rollback_on_failure:true,rollback_cue_number:8});
    expect(result.structuredContent?.status).toBe('partial_failure');
    expect(peer.writes().map(message=>message.address)).toEqual(['/eos/cues/2/fire','/eos/cue/2/8/fire']);
  });
  test('updates a readable explicit cue with an absolute intensity', async () => {
    peer.cues.set('2/10','Existing');
    const result=await runTool(update,{...target,...confirmed,intensity:45});
    expect(result.structuredContent).toMatchObject({status:'ok',verified:false});
    expect(peer.writes().map(message=>message.args?.[0]?.value)).toEqual(['Go To Cue 2/10#','Chan 101 Thru 102 At 45#','Update Cue 2/10#']);
  });
  test.each([{intensity_factor:0.8},{warmify:true},{desaturate:true}])('rejects unimplemented transformations before writes: %j', async flags=>{
    await expect(runTool(update,{...target,...confirmed,intensity:50,...flags})).rejects.toThrow('indisponible');expect(peer.sent).toEqual([]);
  });
  test('patch wrapper preserves omitted XYZ and exposes no invented fixture profile', async () => {
    const result=await runTool(patch,{channel_number:101,dmx_address:'2/1',device_type:'Dimmer',label:'Face',dry_run:true});
    expect(result.structuredContent).toMatchObject({status:'dry_run',verified:false,commandsSent:[]});expect(peer.sent).toEqual([]);
    expect(JSON.stringify(result.structuredContent?.commands_preview)).not.toContain('augment3d');
  });
  test('preparation wrapper previews selective groups and submasters', async () => {
    const result=await runTool(prepare,{dry_run:true,groups:[{number:5,label:'Faces',channels:'101'}],submasters:[{number:6,label:'Faces',channels:'101',level:75}]});
    expect(result.structuredContent).toMatchObject({status:'dry_run',verified:false,commandsSent:[]});expect(peer.sent).toEqual([]);
  });
  test('patch scan preview emits no query', async () => {
    const result=await runTool(scan,{start_channel:1,end_channel:10,dry_run:true});
    expect(result.structuredContent?.dry_run).toBe(true);expect(peer.sent).toEqual([]);
  });
  test('patch scan stops on failure and never reports unanswered channels as valid', async () => {
    const result=await runTool(scan,{start_channel:1,end_channel:5,timeoutMs:50,max_concurrency:1,rate_limit_ms:0,continue_on_error:false});
    expect(result.structuredContent).toMatchObject({status:'partial_failure',scan:{processed:1,failures:1,aborted:true}});
    expect(peer.sent).toEqual([{address:'/eos/get/patch/1/1',args:[]}]);
  });
  test('patch scan bounds ranges as well as explicit channel arrays', async () => {
    await expect(runTool(scan,{start_channel:1,end_channel:1001,dry_run:true})).rejects.toThrow('1000');
    expect(peer.sent).toEqual([]);
  });
});
