/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */

function encodeOscPathSegment(value: number | string): string {
  const segment = String(value).trim();
  if (!/^[A-Za-z0-9_ .%+-]+$/.test(segment)) throw new Error('Segment OSC invalide.');
  return segment;
}

function encodeTrimmedOscPathSegment(value: number | string): string {
  return encodeOscPathSegment(value);
}

export function buildKeyAddress(identifier: string): string {
  return `/eos/key/${identifier}`;
}

export function buildSoftkeyAddress(index: number): string {
  return `/eos/softkey/${encodeOscPathSegment(index)}`;
}

export function buildChannelParameterAddress(channel: number | string, parameter: number | string): string {
  return `/eos/chan/${encodeOscPathSegment(channel)}/param/${encodeOscPathSegment(parameter)}`;
}

export function buildDmxAddressSelectAddress(): string {
  return '/eos/addr';
}

export function buildDmxAddressLevelAddress(address: number | string): string {
  return `/eos/addr/${toAbsoluteDmxAddress(address)}`;
}

export function buildDmxAddressDmxAddress(address: number | string): string {
  return `${buildDmxAddressLevelAddress(address)}/DMX`;
}

export function buildCueFireAddress(cueNumber: string | number, cuelistNumber?: number | null, part?: number | null): string {
  const cue = encodeTrimmedOscPathSegment(cueNumber);
  if (part != null && cuelistNumber == null) throw new Error("Une part exige une liste de cues explicite.");
  if (cuelistNumber != null) {
    return `/eos/cue/${encodeTrimmedOscPathSegment(cuelistNumber)}/${cue}${part != null ? `/${part}` : ''}/fire`;
  }
  return `/eos/cue/${cue}/fire`;
}

export function buildCueGoAddress(cuelistNumber: number): string {
  return `/eos/cues/${encodeTrimmedOscPathSegment(cuelistNumber)}/fire`;
}

export function buildCueSelectAddress(cuelistNumber?: number | null, cueNumber?: string | number | null): string {
  if (cueNumber != null && cuelistNumber == null) throw new Error('Liste explicite requise pour selectionner une part.');
  return cuelistNumber == null ? '/eos/cue' : `/eos/cue/${encodeTrimmedOscPathSegment(cuelistNumber)}${cueNumber != null ? `/${encodeTrimmedOscPathSegment(cueNumber)}` : ''}`;
}

export function buildCueStopBackAddress(cuelistNumber: number): string { return `/eos/cues/${cuelistNumber}/stop`; }
export function buildPatchReadAddress(channel: number, part = 1, section?: 'augment3d/position' | 'augment3d/beam'): string { return `/eos/get/patch/${channel}/${part}${section ? `/${section}` : ''}`; }
export function buildChannelLevelAddress(channel: number): string { return `/eos/chan/${channel}`; }
export function buildChannelColorHsAddress(channel: number): string { return `${buildChannelLevelAddress(channel)}/color/hs`; }


export function buildCuelistBankCreateAddress(
  bankIndex: number,
  cuelistNumber: number,
  previousCueCount: number,
  pendingCueCount: number,
  offset?: number
): string {
  const segments = [
    'eos',
    'cuelist',
    encodeOscPathSegment(bankIndex),
    'config',
    encodeOscPathSegment(cuelistNumber),
    encodeOscPathSegment(previousCueCount),
    encodeOscPathSegment(pendingCueCount)
  ];

  if (offset != null) {
    segments.push(encodeOscPathSegment(offset));
  }

  return `/${segments.join('/')}`;
}

export function buildCuelistBankPageAddress(bankIndex: number, delta: number): string {
  return `/eos/cuelist/${encodeOscPathSegment(bankIndex)}/page/${encodeOscPathSegment(delta)}`;
}

export function buildUserCommandOutAddress(user: number | string): string {
  return `/eos/out/user/${encodeOscPathSegment(user)}/cmd`;
}

export function buildPatchChannelInfoAddress(): string {
  return '/eos/get/patch/{channel}/{part}';
}

export function buildPatchAugment3dPositionAddress(): string {
  return '/eos/get/patch/{channel}/{part}/augment3d/position';
}

export function buildPatchAugment3dBeamAddress(): string {
  return '/eos/get/patch/{channel}/{part}/augment3d/beam';
}

export function buildMacroFireAddress(): string {
  return '/eos/macro/fire';
}

export function buildMacroSelectAddress(): string {
  return '/eos/macro';
}

export function buildSubmasterLevelAddress(submasterNumber: number | string): string {
  return `/eos/sub/${encodeOscPathSegment(submasterNumber)}`;
}

export function buildSubmasterBumpAddress(submasterNumber: number | string): string {
  return `${buildSubmasterLevelAddress(submasterNumber)}/fire`;
}

export function toAbsoluteDmxAddress(address: number | string): number {
  const match = String(address).trim().match(/^(\d+)[./:-](\d+)$/);
  const universe = match ? Number(match[1]) : null;
  const offset = match ? Number(match[2]) : Number(address);
  if (!Number.isInteger(offset) || offset < 1 || (universe !== null && (!Number.isInteger(universe) || universe < 1 || universe > 63999 || offset > 512))) {
    throw new Error('Adresse DMX invalide (univers/1..512 ou adresse absolue).');
  }
  const absolute = universe === null ? offset : (universe - 1) * 512 + offset;
  if (absolute > 63999 * 512) throw new Error('Adresse DMX hors limites.');
  return absolute;
}
