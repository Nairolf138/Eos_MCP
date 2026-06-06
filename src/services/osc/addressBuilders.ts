/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */

function encodeOscPathSegment(value: number | string): string {
  return encodeURIComponent(String(value));
}

function encodeTrimmedOscPathSegment(value: number | string): string {
  return encodeURIComponent(String(value).trim());
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
  return `/eos/addr/${encodeOscPathSegment(address)}`;
}

export function buildDmxAddressDmxAddress(address: number | string): string {
  return `${buildDmxAddressLevelAddress(address)}/DMX`;
}

export function buildCueFireAddress(cueNumber: string | number, cuelistNumber?: number | null): string {
  const cue = encodeTrimmedOscPathSegment(cueNumber);
  if (cuelistNumber != null) {
    return `/eos/cue/${encodeTrimmedOscPathSegment(cuelistNumber)}/${cue}/fire`;
  }
  return `/eos/cue/${cue}/fire`;
}

export function buildCueGoAddress(cuelistNumber: number): string {
  return `/eos/cue/${encodeTrimmedOscPathSegment(cuelistNumber)}/go`;
}

export function buildCueSelectAddress(cueNumber: string | number): string {
  return `/eos/cue/${encodeTrimmedOscPathSegment(cueNumber)}`;
}

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
  return '/eos/get/patch/chan_info';
}

export function buildPatchAugment3dPositionAddress(): string {
  return '/eos/get/patch/chan_pos';
}

export function buildPatchAugment3dBeamAddress(): string {
  return '/eos/get/patch/chan_beam';
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
  return `${buildSubmasterLevelAddress(submasterNumber)}/bump`;
}
