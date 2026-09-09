/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { assertOscAddressStrictModeAllowed, getOscAddressOfficiality, isEosStrictModeEnabled } from '../officiality';

describe('ETC reference-backed OSC address policy', () => {
  test.each([
    '/eos/get/version','/eos/get/patch/101/1','/eos/get/group/index/0',
    '/eos/get/fx/1','/eos/get/fpe/1/0','/eos/get/cue/2/12.5/0',
    '/eos/get/patch/101/1/augment3d/position', '/eos/cues/2/fire', '/eos/cues/2/stop',
    '/eos/cue/2/12.5/1/fire','/eos/group/1','/eos/addr/513/DMX','/eos/addr/513/dmx',
    '/eos/fx','/eos/user/3/newcmd','/eos/user/99/chan/101/param/Pan',
    '/eos/set/group/1/chans','/eos/ds/1/Chan/10','/eos/color/hs','/eos/snap/fire'
  ])('permits implemented native address %s', (address) => {
    expect(getOscAddressOfficiality(address)?.official).toBe(true);
    expect(() => assertOscAddressStrictModeAllowed(address)).not.toThrow();
  });
  test.each([
    '/eos/handshake','/eos/protocol','/eos/get/group/list','/eos/get/submaster/1',
    '/eos/get/cmd_line','/eos/get/live/blind','/eos/get/param/active_wheels',
    '/eos/cue/2/go','/eos/set/group/1/channels','/eos/address/1','/eos/out/cmd',
    '/eos/user/100/newcmd','/eos/user/3/get/version','/eos/chan/1/param/Pan/Delete'
  ])('rejects undocumented/output addresses even with strict mode off: %s', (address) => {
    expect(() => assertOscAddressStrictModeAllowed(address, { EOS_STRICT_MODE:'0' })).toThrow('documentee');
  });
  test('classifies passive output as documented but never transmits it', () => {
    expect(getOscAddressOfficiality('/eos/out/user/3/cmd')?.official).toBe(true);
    expect(() => assertOscAddressStrictModeAllowed('/eos/out/user/3/cmd')).toThrow();
  });
  test('reads the optional command validation profile flag', () => {
    expect(isEosStrictModeEnabled({ EOS_STRICT_MODE:'true' })).toBe(true);
    expect(isEosStrictModeEnabled({ EOS_STRICT_MODE:'0' })).toBe(false);
  });
});
