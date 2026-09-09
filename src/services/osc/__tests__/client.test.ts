/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient, type OscGateway, type OscGatewaySendOptions } from '../client';
import type { OscMessage } from '../index';
import { NativeListAssembler, expandOscNumbers } from '../nativeProtocol';
import { runWithRequestContext } from '../../../server/requestContext';
import { frame, nativeObject, replyToNativeRequest } from './fixtures/nativePeer';

class Peer implements OscGateway {
  public messages: OscMessage[] = [];
  public options: Array<OscGatewaySendOptions | undefined> = [];
  public listeners = new Set<(message: OscMessage) => void>();
  public respond = replyToNativeRequest;
  public async send(message: OscMessage, options?: OscGatewaySendOptions) {
    this.messages.push(message); this.options.push(options);
    for (const response of this.respond(message)) this.emit(response);
  }
  public onMessage(listener: (message: OscMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  public emit(message: OscMessage) { for (const listener of this.listeners) listener(message); }
}

describe('ETC native OSC client', () => {
  let peer: Peer; let client: OscClient;
  beforeEach(() => { peer = new Peer(); client = new OscClient(peer, { defaultTimeoutMs: 35 }); });
  afterEach(() => client.dispose());
  test('connect queries native version without a JSON handshake or protocol negotiation', async () => {
    await expect(client.connect()).resolves.toMatchObject({ status: 'ok', version: '3.3.6 Build 14', selectedProtocol: 'etc-osc', handshake_mode: 'native' });
    expect(peer.messages).toEqual([{ address: '/eos/get/version', args: [] }]);
  });
  test.each(['group','macro','ms','sub','fx','curve','snap','pixmap','ip','fp','cp','bp','preset','cuelist'])('decodes all documented %s sections and native arguments', async (family) => {
    const result = await client.requestJson(`/eos/get/${family}/{number}`, { payload: { number: 7 } });
    expect(result).toMatchObject({ status: 'ok', data: { number: 7, uid: `uid-${family}-7`, label: `${family} 7` } });
    expect(peer.messages[0]).toEqual({ address: `/eos/get/${family}/7`, args: [] });
  });
  test('decodes patch addresses, parts, footprint and notes', async () => {
    const result = await client.requestJson('/eos/get/patch/{channel}/{part}', { payload: { channel: 101, part: 1 } });
    expect(result).toMatchObject({ status: 'ok', data: { channel_number: 101, part_number: 1, address: 513, ending_address: 513, part_count: 1, dmx_address: '2/1', notes: '' } });
  });
  test('decodes cue list/number/part and milliseconds to seconds', async () => {
    const result = await client.requestJson('/eos/get/cue/{cuelist}/{cue}/{part}', { payload: { cuelist: 2, cue: 12.5, part: 0 } });
    expect(result).toMatchObject({ status: 'ok', data: { cuelist: 2, cue: 12.5, part: 0, timings: { up: { time: 2.5 }, down: { time: 4, delay: 1 } } } });
  });
  test.each(['/eos/get/group/index/{index}', '/eos/get/cue/2/index/{index}', '/eos/get/patch/index/{index}'])('enumerates %s with count and zero-based index, never /list', async (address) => {
    const response = await client.requestJson(address);
    expect(response).toMatchObject({ status: 'ok', data: { count: 1, items: [expect.objectContaining({ number: 7 })] } });
    expect(peer.messages.map((message) => message.address)).toEqual([address.replace('/index/{index}', '/count'), address.replace('{index}', '0')]);
  });
  test.each([
    ['/eos/get/setup', { up_time: 5 }], ['/eos/get/show/path', { name: 'Rehearsal' }],
    ['/eos/get/fpe/1', { set_number: 1, point_count: 1 }], ['/eos/get/fpe/1/0', { point_number: 0, focus_palette: 901, position: { x: -3, y: 4, z: 0 } }],
    ['/eos/get/patch/101/1/augment3d/position', { position: { x: 1, y: 2, z: 3 }, orientation: { x: 10, y: 20, z: 30 } }],
    ['/eos/get/patch/101/1/augment3d/beam', { beam_angle: 25, shutters: [{ thrust: 0.5, angle: 15 }] }]
  ])('decodes scalar/special response %s', async (address, data) => {
    await expect(client.requestJson(address as string)).resolves.toMatchObject({ status: 'ok', data });
  });
  test('empty native target means absent; silence does not', async () => {
    peer.respond = () => [frame('/eos/out/get/group/7', [])];
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'error', data: { exists: false } });
    peer.respond = () => [];
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'timeout', data: null });
  });
  test('waits for every section and out-of-order argument fragment', async () => {
    const main = nativeObject('group', 7)[0];
    const values = main.args!.map((arg) => arg.value);
    peer.respond = () => [frame('/eos/out/get/group/7/list/2/3', values.slice(2)), frame('/eos/out/get/group/7/channels/list/2/3', ['101-102']), frame('/eos/out/get/group/7/list/0/3', values.slice(0,2)), frame('/eos/out/get/group/7/channels/list/0/3', values.slice(0,2))];
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'ok', data: { channels: [101,102] } });
  });
  test('incomplete or inconsistent objects never become a successful read', async () => {
    peer.respond = () => nativeObject('group', 7).slice(0, 1);
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'timeout' });
    peer.respond = () => [nativeObject('group', 7)[0], frame('/eos/out/get/group/7/channels/list/0/3', [-1,'other-uid',101])];
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'error', error: expect.stringContaining('UID') });
  });
  test('does not accept JSON as a native version or an undocumented endpoint', async () => {
    peer.respond = () => [frame('/eos/out/get/version', ['{"version":"3.3.6"}'])];
    await expect(client.requestJson('/eos/get/version')).resolves.toMatchObject({ status: 'error' });
    await expect(client.sendMessage('/eos/handshake')).rejects.toThrow('documentee');
  });
  test('ignores a different console peer', async () => {
    peer.respond = () => nativeObject('group', 7).map((message) => ({ ...message, source: { address: '192.0.2.99', port: 3032 } }));
    await expect(client.requestJson('/eos/get/group/7', { targetAddress: '192.0.2.10' })).resolves.toMatchObject({ status: 'timeout' });
  });
  test('uses atomic user-scoped command addresses under concurrent sends', async () => {
    peer.respond = () => [];
    await Promise.all([client.sendNewCommand('Chan 101 At 50#', { user: 3 }), client.sendNewCommand('Chan 102 At 25#', { user: 4 })]);
    expect(peer.messages.map((message) => message.address)).toEqual(['/eos/user/3/newcmd','/eos/user/4/newcmd']);
    await expect(client.sendNewCommand('Clear', { user: 100 })).rejects.toThrow();
  });
  test('native parameter actions also use the explicit user', async () => {
    await runWithRequestContext({ correlationId: 'user', userId: 3 }, () => client.sendMessage('/eos/chan/101/param/Pan', [{ type: 'f', value: -90 }]));
    expect(peer.messages[0].address).toBe('/eos/user/3/chan/101/param/Pan');
  });
  test('fresh command line feedback retains the error flag and rejects stale/user-mismatched data', async () => {
    peer.emit(frame('/eos/out/user/3/cmd', ['LIVE: Record Group 7', 1]));
    const cursor = client.getCommandLineSequence();
    await expect(client.getCommandLine({ user: 3 })).resolves.toMatchObject({ status: 'error', command_error: true, sequence: cursor });
    await expect(client.getCommandLine({ user: 4 })).resolves.toMatchObject({ status: 'timeout' });
    await expect(client.getCommandLine({ user: 3, afterSequence: cursor })).resolves.toMatchObject({ status: 'timeout' });
    expect(peer.messages).toEqual([]);
  });
  test('passive state and wheels observations never send invented GET requests', async () => {
    peer.emit(frame('/eos/out/event/state', [1]));
    await expect(client.requestJson('/eos/out/event/state')).resolves.toMatchObject({ status: 'ok', data: { state: 1 } });
    peer.emit(frame('/eos/out/active/wheel/1', ['Pan', 'Focus', -30]));
    await expect(client.requestJson('/eos/out/active/wheel/{index}')).resolves.toMatchObject({ status: 'ok', data: { is_complete: false, wheels: [{ index: 1, parameter: 'Pan', value: -30 }] } });
    expect(peer.messages).toEqual([]);
  });
  test('subscribe uses one integer; reset has no invented acknowledgement', async () => {
    await client.subscribe({ path: '/eos/out/notify/group', enable: true });
    await client.reset();
    expect(peer.messages).toEqual([{ address: '/eos/subscribe', args: [{ type: 'i', value: 1 }] }, { address: '/eos/reset', args: [] }]);
  });
  test('preview intercepts writes and preserves exact native messages', async () => {
    const oscPreview: Array<{ address: string; args: unknown[] }> = [];
    await runWithRequestContext({ correlationId: 'preview', dryRun: true, oscPreview }, () => client.sendMessage('/eos/color/hs', [{ type: 'f', value: 240 }, { type: 'f', value: 50 }]));
    expect(peer.messages).toEqual([]); expect(oscPreview).toHaveLength(1);
  });
  test('a send rejection cleans up the response waiter without unhandled rejection', async () => {
    peer.send = async () => { throw new Error('network failed'); };
    await expect(client.requestJson('/eos/get/group/7')).resolves.toMatchObject({ status: 'error' });
    expect(peer.listeners.size).toBe(1);
  });
  test('list assembler rejects contradictory duplicates and invalid bounds', () => {
    const assembler = new NativeListAssembler();
    expect(assembler.accept(frame('/eos/out/get/group/1/list/0/3', [0]))).toBeNull();
    expect(() => assembler.accept(frame('/eos/out/get/group/1/list/0/3', [1]))).toThrow('contradictoires');
    expect(() => assembler.accept(frame('/eos/out/get/group/1/list/2/3', [1,2]))).toThrow('invalide');
    expect(expandOscNumbers(['1 Thru 3', '5 > 6', 8])).toEqual([1,2,3,5,6,8]);
  });
});
