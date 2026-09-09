/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { frame, nativeObject } from '../../../services/osc/__tests__/fixtures/nativePeer';
import { buildPatchSequence, applyPatchPlans } from '../patchSequence';
import { prepareShowObjects } from '../showPreparation';

/** Deliberately small synthetic peer: only the documented frames used below.
 * Its command parser is a test double, not an implementation or validation of Eos CLI.
 */
class ShowPeer implements OscGateway {
  public sent: OscMessage[] = [];
  public listeners = new Set<(message: OscMessage) => void>();
  public objects = new Map<string, OscMessage[]>();
  public silent = false;
  public ignoreWrites = false;
  public failAtCommand: number | null = null;
  private commands = 0;
  public setPatch(channel: number, address: number, footprint = 1, model = 'Dimmer', label = 'Existing') {
    const messages = nativeObject('patch', channel, -1, label);
    const values = messages[0].args!.map((arg) => arg.value);
    values[4] = model; values[5] = address; values[6] = address; values[20] = address ? address + footprint - 1 : 0;
    messages[0] = frame(messages[0].address, values);
    this.objects.set(`patch:${channel}`, messages);
  }
  public onMessage(listener: (message: OscMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(message: OscMessage) { for (const listener of this.listeners) listener(message); }
  public async send(message: OscMessage) {
    this.sent.push(message);
    const address = message.address.replace(/^\/eos\/user\/\d+\//, '/eos/');
    const value = message.args?.[0]?.value;
    if (address === '/eos/newcmd') {
      if (++this.commands === this.failAtCommand) throw new Error('Synthetic transport failure');
      if (!this.ignoreWrites) {
        const patch = String(value).match(/^Address (\d+) At (\d+) Part 1#$/);
        if (patch) this.setPatch(Number(patch[2]), Number(patch[1]));
        const record = String(value).match(/^Chan ([\d +]+)( Intensity)? Record (Group|Color_Palette|Focus_Palette|Sub) (\d+)#$/);
        if (record) {
          const family = ({ Group: 'group', Color_Palette: 'cp', Focus_Palette: 'fp', Sub: 'sub' } as Record<string,string>)[record[3]];
          const messages = nativeObject(family, Number(record[4]));
          const members = messages.find((entry) => entry.address.includes('/channels/'));
          if (members) members.args = frame('', [-1, `uid-${family}-${record[4]}`, record[1].replace(/ \+ /g, ' ')]).args;
          this.objects.set(`${family}:${record[4]}`, messages);
        }
      }
    }
    const label = address.match(/^\/eos\/set\/(\w+)\/(\d+)\/label$/);
    if (label && !this.ignoreWrites) {
      const main = this.objects.get(`${label[1]}:${label[2]}`)?.[0];
      if (main) main.args![2] = { type: 's', value };
    }
    if (this.silent || !address.startsWith('/eos/get/')) return;
    if (address === '/eos/get/patch/count') { this.emit(frame('/eos/out/get/patch/count', [[...this.objects.keys()].filter((key) => key.startsWith('patch:')).length])); return; }
    const index = address.match(/^\/eos\/get\/patch\/index\/(\d+)$/);
    if (index) {
      const item = [...this.objects.entries()].filter(([key]) => key.startsWith('patch:'))[Number(index[1])];
      if (item) for (const source of item[1]) { const args = source.args!.map((arg) => arg.value); args[0] = Number(index[1]); this.emit(frame(source.address, args)); }
      return;
    }
    const resource = address.match(/^\/eos\/get\/(\w+)\/(\d+)(?:\/1)?$/);
    if (resource) {
      const messages = this.objects.get(`${resource[1]}:${resource[2]}`);
      for (const response of messages ?? [frame(address.replace('/eos/get/', '/eos/out/get/'), [])]) this.emit(response);
    }
  }
  public writes() { return this.sent.filter((entry) => !entry.address.startsWith('/eos/get/')); }
}

describe('Professional preparation with native readback and failure handling', () => {
  let peer: ShowPeer;
  const confirmed = { user: 3, require_confirmation: true, verification_timeout_ms: 50 };
  const plan = (channel = 101, address = '2/1', label?: string) => buildPatchSequence({ channel_number: channel, dmx_address: address, device_type: 'Dimmer', label }).plan;
  beforeEach(() => { peer = new ShowPeer(); setOscClient(new OscClient(peer, { defaultTimeoutMs: 30 })); });
  afterEach(() => setOscClient(null));
  test('previews a whole patch with no console traffic and preserves optional labels/positions', async () => {
    const result = await applyPatchPlans([plan(101), plan(102, '2/2', 'Face')], { dry_run: true }, 'patch');
    expect(result.structuredContent).toMatchObject({ status: 'dry_run', verified: false, preflight_console: 'not_run' });
    expect(peer.sent).toEqual([]);
    expect(plan(101)).not.toHaveProperty('position');
    expect(result.structuredContent?.commands_preview).not.toEqual(expect.arrayContaining([expect.stringContaining('/101/label')]));
  });
  test.each([
    { channel_number: 101, dmx_address: '2/500', eos_profile: 'Moving Head Extended', dmx_footprint: 20 },
    { channel_number: 101, dmx_address: '2/1', device_type: 'Moving Head' },
    { channel_number: 101, dmx_address: '2/1', device_type: 'Dimmer', position_x: 1 },
    { channel_number: 101, dmx_address: '2/1', device_type: 'Dimmer', part: 2 }
  ])('rejects an ambiguous/overflowing patch plan before OSC (%j)', (options) => {
    expect(() => buildPatchSequence(options)).toThrow(); expect(peer.sent).toEqual([]);
  });
  test('rejects duplicate channels and overlapping addresses before reading or writing', async () => {
    await expect(applyPatchPlans([plan(),plan(101,'2/2')], confirmed, 'patch')).rejects.toThrow('duplique');
    await expect(applyPatchPlans([plan(),plan(102)], confirmed, 'patch')).rejects.toThrow('Collision');
    expect(peer.sent).toEqual([]);
  });
  test('checks the existing patch before any write and refuses an occupied address', async () => {
    peer.setPatch(99, 513, 10, 'Prepared fixture');
    await expect(applyPatchPlans([plan()], confirmed, 'patch')).rejects.toThrow('Collision');
    expect(peer.writes()).toEqual([]);
  });
  test('does not interpret an unanswered preflight as an empty console', async () => {
    peer.silent = true;
    await expect(applyPatchPlans([plan()], confirmed, 'patch')).rejects.toThrow('incomplet');
    expect(peer.writes()).toEqual([]);
  });
  test('requires explicit permission to readdress an existing channel', async () => {
    peer.setPatch(101, 600);
    await expect(applyPatchPlans([plan()], confirmed, 'patch')).rejects.toThrow('allow_readdress');
    expect(peer.writes()).toEqual([]);
  });
  test.each(['Other profile', 'Exact profile'])('refuses an unknown footprint/profile before writing (%s)', async (model) => {
    peer.setPatch(101, 0, 20, model);
    const fixture = buildPatchSequence({ channel_number: 101, dmx_address: '2/1', eos_profile: 'Exact profile', dmx_footprint: 20 }).plan;
    await expect(applyPatchPlans([fixture], confirmed, 'patch')).rejects.toThrow();
    expect(peer.writes()).toEqual([]);
  });
  test('patches two dimmers, preserves requested channel numbers and reads back both labels', async () => {
    const result = await applyPatchPlans([plan(101,'2/1','Face jardin'),plan(102,'2/2','Face cour')], confirmed, 'patch');
    expect(result.structuredContent).toMatchObject({ status: 'ok', verified: true, completed_channels: [101,102] });
    expect(peer.writes().filter((message) => message.address.endsWith('/newcmd')).map((message) => message.args?.[0]?.value)).toEqual(['Address 513 At 101 Part 1#','Address 514 At 102 Part 1#']);
    expect(peer.writes().some((message) => message.address === '/eos/user')).toBe(false);
  });
  test('does not replay a rejected patch write or continue to the next channel', async () => {
    peer.ignoreWrites = true;
    const result = await applyPatchPlans([plan(101),plan(102,'2/2')], confirmed, 'patch');
    expect(result.structuredContent).toMatchObject({ status: 'partial_failure', verified: false, completed_channels: [] });
    expect(peer.writes().filter((message) => message.address.endsWith('/newcmd'))).toHaveLength(1);
  });
  test('validates all groups/palettes/subs before any write and refuses an existing target', async () => {
    peer.objects.set('sub:12', nativeObject('sub',12));
    await expect(prepareShowObjects({ ...confirmed, groups: [{ number: 11, label: 'Faces', channels: '101 Thru 102' }], submasters: [{ number:12, label:'Faces', channels:'101 Thru 102' }] }, 'prepare')).rejects.toThrow('deja presente');
    expect(peer.writes()).toEqual([]);
  });
  test('requires explicit palette values, or an explicit instruction to record current values', async () => {
    await expect(prepareShowObjects({ ...confirmed, color_palettes: [{ number: 11, label: 'Rouge', channels: '101' }] }, 'prepare')).rejects.toThrow('hue+saturation');
    expect(peer.sent).toEqual([]);
  });
  test('records selective groups and verifies exact membership', async () => {
    const result = await prepareShowObjects({ ...confirmed, groups: [{ number: 11, label: 'Faces', channels: '101 Thru 102' }] }, 'prepare');
    expect(result.structuredContent).toMatchObject({ status: 'ok', verified: true, completed: ['group:11'] });
    expect(peer.writes().find((message) => message.address.endsWith('/newcmd'))?.args?.[0]?.value).toBe('Chan 101 + 102 Record Group 11#');
  });
  test('records a selective intensity-only sub without claiming that OSC Get verifies stored levels', async () => {
    const result = await prepareShowObjects({ ...confirmed, submasters: [{ number: 12, label: 'Faces', channels: '101 Thru 102', level: 75 }] }, 'prepare');
    expect(result.structuredContent).toMatchObject({ status: 'ok', verified: false, completed: ['sub:12'], limitations: [expect.stringContaining('valeurs stockees')] });
    expect(peer.writes().find((message) => message.address.endsWith('/newcmd'))?.args?.[0]?.value).toBe('Chan 101 + 102 Intensity Record Sub 12#');
    expect(peer.writes().filter((message) => message.address.includes('/chan/'))).toHaveLength(2);
  });
  test('label text containing command tokens remains one OSC string and never enters the CLI', async () => {
    const label = 'Face "Jardin" # Delete Cue 1';
    const result = await prepareShowObjects({ ...confirmed, groups: [{ number: 11, label, channels: '101' }] }, 'prepare');
    expect(result.structuredContent?.status).toBe('ok');
    expect(peer.writes().find((message) => message.address.endsWith('/label'))?.args).toEqual([{ type:'s', value: label }]);
    expect(peer.writes().filter((message) => message.address.endsWith('/newcmd')).every((message) => !String(message.args?.[0]?.value).includes('Delete'))).toBe(true);
  });
  test('stops on a transport failure and reports only completed targets', async () => {
    peer.failAtCommand = 2;
    const result = await prepareShowObjects({ ...confirmed, groups: [11,12,13].map((number) => ({ number, label: `Group ${number}`, channels: '101' })) }, 'prepare');
    expect(result.structuredContent).toMatchObject({ status: 'partial_failure', verified: false, completed: ['group:11'] });
    expect(peer.objects.has('group:13')).toBe(false);
  });
});
