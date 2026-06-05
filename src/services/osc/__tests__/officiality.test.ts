/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  OSC_ADDRESS_OFFICIALITY,
  assertOscAddressStrictModeAllowed,
  getOscAddressOfficiality,
  isEosStrictModeEnabled
} from '../officiality';

const strictEnv = { EOS_STRICT_MODE: 'true' } as NodeJS.ProcessEnv;

describe('OSC address officiality classification', () => {
  it('classe les adresses OSC avec les champs requis', () => {
    expect(OSC_ADDRESS_OFFICIALITY.length).toBeGreaterThan(0);
    for (const entry of OSC_ADDRESS_OFFICIALITY) {
      expect(entry.address).toMatch(/^\/eos\//);
      expect(typeof entry.official).toBe('boolean');
      expect(typeof entry.strictModeAllowed).toBe('boolean');
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.notes.length).toBeGreaterThan(0);
    }
  });

  it('resout les templates utilises par les outils MCP', () => {
    expect(getOscAddressOfficiality('/eos/fader/1/2/3')?.strictModeAllowed).toBe(true);
    expect(getOscAddressOfficiality('/eos/group/4/level')?.official).toBe(true);
    expect(getOscAddressOfficiality('/eos/key/go_0')?.official).toBe(true);
    expect(getOscAddressOfficiality('/eos/out/user/3/cmd')).toMatchObject({ official: true, strictModeAllowed: true });
  });

  it('identifie les extensions MCP bloquees en mode strict', () => {
    const extension = getOscAddressOfficiality('/eos/get/patch/chan_pos');
    expect(extension).toMatchObject({ official: false, strictModeAllowed: false, source: 'MCP extension' });
    expect(getOscAddressOfficiality('/eos/get/cmd_line')).toMatchObject({
      official: false,
      strictModeAllowed: false,
      source: 'MCP extension'
    });
    expect(() => assertOscAddressStrictModeAllowed('/eos/get/patch/chan_pos', strictEnv)).toThrow(/EOS_STRICT_MODE bloque/);
    expect(() => assertOscAddressStrictModeAllowed('/eos/get/cmd_line', strictEnv)).toThrow(/EOS_STRICT_MODE bloque/);
  });

  it('autorise /eos/cmd et les commandes runtime necessaires en mode strict', () => {
    expect(() => assertOscAddressStrictModeAllowed('/eos/cmd', strictEnv)).not.toThrow();
    expect(() => assertOscAddressStrictModeAllowed('/eos/handshake', strictEnv)).not.toThrow();
  });

  it('autorise les chemins DMX /eos/addr et bloque les aliases legacy en mode strict', () => {
    expect(() => assertOscAddressStrictModeAllowed('/eos/addr', strictEnv)).not.toThrow();
    expect(() => assertOscAddressStrictModeAllowed('/eos/addr/1%2F001', strictEnv)).not.toThrow();
    expect(() => assertOscAddressStrictModeAllowed('/eos/addr/1%2F001/DMX', strictEnv)).not.toThrow();
    expect(() => assertOscAddressStrictModeAllowed('/eos/dmx/address/dmx', strictEnv)).toThrow(/EOS_STRICT_MODE bloque/);
  });

  it('parse EOS_STRICT_MODE comme un booleen opt-in', () => {
    expect(isEosStrictModeEnabled({ EOS_STRICT_MODE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isEosStrictModeEnabled({ EOS_STRICT_MODE: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isEosStrictModeEnabled({ EOS_STRICT_MODE: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isEosStrictModeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
