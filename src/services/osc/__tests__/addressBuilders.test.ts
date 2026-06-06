/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  buildChannelParameterAddress,
  buildCueFireAddress,
  buildCueGoAddress,
  buildCueSelectAddress,
  buildCuelistBankCreateAddress,
  buildCuelistBankPageAddress,
  buildDmxAddressDmxAddress,
  buildDmxAddressLevelAddress,
  buildDmxAddressSelectAddress,
  buildMacroFireAddress,
  buildMacroSelectAddress,
  buildPatchAugment3dBeamAddress,
  buildPatchAugment3dPositionAddress,
  buildPatchChannelInfoAddress,
  buildSoftkeyAddress,
  buildSubmasterBumpAddress,
  buildSubmasterLevelAddress,
  buildUserCommandOutAddress
} from '../addressBuilders';

describe('OSC address builders', () => {
  it('construit les adresses de parametre de channel', () => {
    expect(buildChannelParameterAddress(101, 'Pan/Tilt')).toBe('/eos/chan/101/param/Pan%2FTilt');
  });

  it('construit les adresses DMX', () => {
    expect(buildDmxAddressSelectAddress()).toBe('/eos/addr');
    expect(buildDmxAddressLevelAddress('2/041')).toBe('/eos/addr/2%2F041');
    expect(buildDmxAddressDmxAddress('2/041')).toBe('/eos/addr/2%2F041/DMX');
  });

  it('construit les adresses de softkey', () => {
    expect(buildSoftkeyAddress(12)).toBe('/eos/softkey/12');
  });

  it('construit les adresses de cue', () => {
    expect(buildCueFireAddress(' 10.5 ', 3)).toBe('/eos/cue/3/10.5/fire');
    expect(buildCueFireAddress(10)).toBe('/eos/cue/10/fire');
    expect(buildCueGoAddress(7)).toBe('/eos/cue/7/go');
    expect(buildCueSelectAddress('1/2')).toBe('/eos/cue/1%2F2');
    expect(buildCuelistBankCreateAddress(99, 2, 4, 7)).toBe('/eos/cuelist/99/config/2/4/7');
    expect(buildCuelistBankCreateAddress(99, 2, 4, 7, -1)).toBe('/eos/cuelist/99/config/2/4/7/-1');
    expect(buildCuelistBankPageAddress(5, -2)).toBe('/eos/cuelist/5/page/-2');
  });

  it('construit les adresses de commande prefixees par utilisateur', () => {
    expect(buildUserCommandOutAddress(3)).toBe('/eos/out/user/3/cmd');
  });

  it('construit les adresses de patch', () => {
    expect(buildPatchChannelInfoAddress()).toBe('/eos/get/patch/chan_info');
    expect(buildPatchAugment3dPositionAddress()).toBe('/eos/get/patch/chan_pos');
    expect(buildPatchAugment3dBeamAddress()).toBe('/eos/get/patch/chan_beam');
  });

  it('construit les adresses de macro', () => {
    expect(buildMacroFireAddress()).toBe('/eos/macro/fire');
    expect(buildMacroSelectAddress()).toBe('/eos/macro');
  });

  it('construit les adresses de submaster', () => {
    expect(buildSubmasterLevelAddress(7)).toBe('/eos/sub/7');
    expect(buildSubmasterBumpAddress(7)).toBe('/eos/sub/7/bump');
  });
});

describe('usage centralise des builders dans src/tools', () => {
  it('evite les constructions manuelles dynamiques pour les familles centralisees', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const output = execFileSync('rg', ['`/eos|`\\$\\{oscMappings\\.[^`]+\\}/', 'src/tools', '-g', '!**/__tests__/**', '-n'], {
      cwd: root,
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const forbidden = output.filter((line) => (
      /\/eos\/(?:chan|addr|softkey|cue|cuelist|out\/user|get\/patch|macro|sub)\b/.test(line)
      || /oscMappings\.(?:channels|dmx|keys|cues|patch|macros|submasters)\./.test(line)
    ));

    expect(forbidden).toEqual([]);
  });
});
