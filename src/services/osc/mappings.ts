/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
export const oscMappings = {
  commands: {
    command: '/eos/cmd',
    newCommand: '/eos/newcmd',
    getCommandLine: '/eos/out/user/{number}/cmd'
  },
  connection: {
    ping: '/eos/ping'
  },
  keys: {
    base: '/eos/key',
    press: '/eos/key/{key}',
    softkey: '/eos/softkey/{index}',
    softkeyLabels: '/eos/out/softkey/{index}'
  },
  channels: {
    command: '/eos/cmd',
    base: '/eos/chan',
    info: '/eos/get/patch/{channel}/{part}'
  },
  dmx: {
    command: '/eos/cmd',
    base: '/eos/addr',
    addressSelect: '/eos/addr',
    addressLevel: '/eos/addr/{address}',
    addressDmx: '/eos/addr/{address}/DMX',
    compatibility: {
      nonStrictLegacy: {
        addressSelect: '/eos/addr',
        addressLevel: '/eos/addr/{address}',
        addressDmx: '/eos/addr/{address}/DMX'
      }
    }
  },
  groups: {
    select: '/eos/group',
    level: '/eos/group/{group}',
    info: '/eos/get/group/{number}',
    list: '/eos/get/group/index/{index}'
  },
  palettes: {
    info: '/eos/get/{palette_type}/{number}',
    intensity: {
      fire: '/eos/ip/fire',
      info: '/eos/get/ip/{number}'
    },
    focus: {
      fire: '/eos/fp/fire',
      info: '/eos/get/fp/{number}'
    },
    color: {
      fire: '/eos/cp/fire',
      info: '/eos/get/cp/{number}'
    },
    beam: {
      fire: '/eos/bp/fire',
      info: '/eos/get/bp/{number}'
    }
  },
  presets: {
    fire: '/eos/preset/fire',
    select: '/eos/preset',
    info: '/eos/get/preset/{number}'
  },
  macros: {
    fire: '/eos/macro/fire',
    select: '/eos/macro',
    info: '/eos/get/macro/{number}'
  },
  snapshots: {
    recall: '/eos/snap/fire',
    info: '/eos/get/snap/{number}'
  },
  curves: {
    select: '/eos/curve',
    info: '/eos/get/curve/{number}'
  },
  effects: {
    select: '/eos/cmd',
    stop: '/eos/cmd',
    info: '/eos/get/fx/{number}'
  },
  parameters: {
    wheelTick: '/eos/wheel/{mode}/{parameter}',
    wheelRate: '/eos/switch/{parameter}',
    colorHs: '/eos/color/hs',
    colorRgb: '/eos/color/rgb',
    positionXY: '/eos/pantilt/xy',
    positionXYZ: '/eos/xyz',
    activeWheels: '/eos/out/active/wheel/{index}'
  },
  fpe: {
    getSetCount: '/eos/get/fpe/count',
    getSetInfo: '/eos/get/fpe/{set}',
    getPointInfo: '/eos/get/fpe/{set}/{point}'
  },
  faders: {
    base: '/eos/fader',
    bankCreate: '/eos/fader/{index}/config/{faders}',
    bankCreateOnPage: '/eos/fader/{index}/config/{page}/{faders}',
    bankPage: '/eos/fader/{index}/page/{delta}',
    level: '/eos/fader/{index}/{fader}',
    load: '/eos/fader/{index}/{fader}/load',
    unload: '/eos/fader/{index}/{fader}/unload'
  },
  directSelects: {
    base: '/eos/ds/{index}/{button}',
    bankCreate: '/eos/ds/{index}/{target}/{buttons}',
    bankCreateFlexi: '/eos/ds/{index}/{target}/flexi/{buttons}',
    bankCreateOnPage: '/eos/ds/{index}/{target}/{page}/{buttons}',
    bankCreateFlexiOnPage: '/eos/ds/{index}/{target}/flexi/{page}/{buttons}',
    bankPage: '/eos/ds/{index}/page/{delta}'
  },
  pixelMaps: {
    select: '/eos/pixmap',
    info: '/eos/get/pixmap/{number}'
  },
  magicSheets: {
    open: '/eos/ms',
    sendString: '/eos/newcmd',
    info: '/eos/get/ms/{number}'
  },
  queries: {
    cue: {
      count: '/eos/get/cue/{cuelist}/count',
      list: '/eos/get/cue/{cuelist}/index/{index}'
    },
    cuelist: {
      count: '/eos/get/cuelist/count',
      list: '/eos/get/cuelist/index/{index}'
    },
    group: {
      count: '/eos/get/group/count',
      list: '/eos/get/group/index/{index}'
    },
    macro: {
      count: '/eos/get/macro/count',
      list: '/eos/get/macro/index/{index}'
    },
    ms: {
      count: '/eos/get/ms/count',
      list: '/eos/get/ms/index/{index}'
    },
    ip: {
      count: '/eos/get/ip/count',
      list: '/eos/get/ip/index/{index}'
    },
    fp: {
      count: '/eos/get/fp/count',
      list: '/eos/get/fp/index/{index}'
    },
    cp: {
      count: '/eos/get/cp/count',
      list: '/eos/get/cp/index/{index}'
    },
    bp: {
      count: '/eos/get/bp/count',
      list: '/eos/get/bp/index/{index}'
    },
    preset: {
      count: '/eos/get/preset/count',
      list: '/eos/get/preset/index/{index}'
    },
    sub: {
      count: '/eos/get/sub/count',
      list: '/eos/get/sub/index/{index}'
    },
    fx: {
      count: '/eos/get/fx/count',
      list: '/eos/get/fx/index/{index}'
    },
    curve: {
      count: '/eos/get/curve/count',
      list: '/eos/get/curve/index/{index}'
    },
    snap: {
      count: '/eos/get/snap/count',
      list: '/eos/get/snap/index/{index}'
    },
    pixmap: {
      count: '/eos/get/pixmap/count',
      list: '/eos/get/pixmap/index/{index}'
    }
  },
  patch: {
    channelInfo: '/eos/get/patch/{channel}/{part}',
    augment3dPosition: '/eos/get/patch/{channel}/{part}/augment3d/position',
    augment3dBeam: '/eos/get/patch/{channel}/{part}/augment3d/beam'
  },
  submasters: {
    base: '/eos/sub',
    info: '/eos/get/sub/{number}'
  },
  cues: {
    fire: '/eos/cue/{cuelist}/{cue}/fire',
    fireWithoutCuelist: '/eos/cue/{cue}/fire',
    go: '/eos/cue/{cuelist}/go',
    stopBackCommand: '/eos/cmd',
    select: '/eos/cue',
    compatibility: {
      fire: '/eos/cmd',
      go: '/eos/cmd',
      select: '/eos/cmd'
    },
    info: '/eos/get/cue/{cuelist}/{cue}/{part}',
    list: '/eos/get/cue/{cuelist}/index/{index}',
    cuelistInfo: '/eos/get/cuelist/{cuelist}',
    bankCreate: '/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}',
    bankPage: '/eos/cuelist/{bank_index}/page/{delta}',
    active: '/eos/out/active/cue',
    pending: '/eos/out/pending/cue'
  },
  showControl: {
    showName: '/eos/get/show/path',
    liveBlindState: '/eos/out/event/state',
    toggleStagingMode: '/eos/key/staging_mode',
    setCueSendString: '/eos/newcmd',
    setCueReceiveString: '/eos/newcmd'
  },
  system: {
    getVersion: '/eos/get/version',
    getSetupDefaults: '/eos/get/setup',
    setUserId: '/eos/user'
  }
} as const;

export const oscPayloadAnnotations = {
  commands: {
    command: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing an EOS command-line command' },
    newCommand: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing an EOS command-line command' }
  },
  channels: {
    parameter: { wireFormat: 'eos-native-arguments', arguments: 'EOS-native channel parameter float argument' }
  },
  dmx: {
    addressDmx: { wireFormat: 'eos-native-arguments', arguments: 'EOS-native DMX raw integer argument' }
  },
  groups: {
    level: { wireFormat: 'eos-native-arguments', arguments: 'EOS-native group level float argument' }
  },
  keys: {
    press: { wireFormat: 'eos-native-arguments', arguments: 'EOS-native key press float argument' }
  },
  effects: {
    select: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing `Effect <number>`' },
    stop: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing `Effect Stop` or `Effect <number> Stop`' }
  },
  faders: {
    bankCreate: { wireFormat: 'eos-native-address', arguments: 'EOS-native address path encodes bank, optional page, and fader count' }
  },
  directSelects: {
    bankCreate: { wireFormat: 'eos-native-address', arguments: 'EOS-native address path encodes bank, target, optional flexi, optional page, and buttons' }
  },
  cues: {
    fire: { wireFormat: 'eos-native-address', arguments: 'EOS-native address path encodes cue/cuelist, no OSC arguments' },
    go: { wireFormat: 'eos-native-address', arguments: 'EOS-native address path encodes cuelist, no OSC arguments' },
    select: { wireFormat: 'eos-native-arguments', arguments: '/eos/cue [cue]; /eos/cue/<list> [cue]; /eos/cue/<list>/<cue> [part]' },
    compatibility: { wireFormat: 'eos-native-command', arguments: 'fallback /eos/cmd with a single EOS command string when native address cannot represent the request' }
  },
  magicSheets: {
    open: { wireFormat: 'eos-native-arguments', arguments: 'OSC integer arguments for magic sheet number and optional view number' }
  },
  showControl: {
    setCueSendString: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing `Show_Control Cue_Send_String ...`' },
    setCueReceiveString: { wireFormat: 'eos-native-command', arguments: 'single OSC string containing `Show_Control Cue_Receive_String ...`' }
  }
} as const;

export type OscMappings = typeof oscMappings;

export {
  buildChannelParameterAddress,
  buildCueFireAddress,
  buildCueGoAddress,
  buildCueSelectAddress,
  buildDmxAddressDmxAddress,
  buildDmxAddressLevelAddress,
  buildDmxAddressSelectAddress,
  buildKeyAddress,
  buildMacroFireAddress,
  buildMacroSelectAddress,
  buildPatchAugment3dBeamAddress,
  buildPatchAugment3dPositionAddress,
  buildPatchChannelInfoAddress,
  buildSoftkeyAddress,
  buildSubmasterBumpAddress,
  buildSubmasterLevelAddress,
  buildUserCommandOutAddress
} from './addressBuilders';

export function toEosOutResponseAddress(address: string): string {
  return address.startsWith('/eos/out/') ? address : address.replace(/^\/eos\//, '/eos/out/');
}

export function withEosOutResponseVariant(address: string): readonly [string, string] {
  return [address, toEosOutResponseAddress(address)] as const;
}

export const oscResponseMappings = {
  queries: {
    cue: {
      count: withEosOutResponseVariant(oscMappings.queries.cue.count),
      list: withEosOutResponseVariant(oscMappings.queries.cue.list)
    },
    cuelist: {
      count: withEosOutResponseVariant(oscMappings.queries.cuelist.count),
      list: withEosOutResponseVariant(oscMappings.queries.cuelist.list)
    },
    group: {
      count: withEosOutResponseVariant(oscMappings.queries.group.count),
      list: withEosOutResponseVariant(oscMappings.queries.group.list)
    },
    macro: {
      count: withEosOutResponseVariant(oscMappings.queries.macro.count),
      list: withEosOutResponseVariant(oscMappings.queries.macro.list)
    },
    ms: {
      count: withEosOutResponseVariant(oscMappings.queries.ms.count),
      list: withEosOutResponseVariant(oscMappings.queries.ms.list)
    },
    ip: {
      count: withEosOutResponseVariant(oscMappings.queries.ip.count),
      list: withEosOutResponseVariant(oscMappings.queries.ip.list)
    },
    fp: {
      count: withEosOutResponseVariant(oscMappings.queries.fp.count),
      list: withEosOutResponseVariant(oscMappings.queries.fp.list)
    },
    cp: {
      count: withEosOutResponseVariant(oscMappings.queries.cp.count),
      list: withEosOutResponseVariant(oscMappings.queries.cp.list)
    },
    bp: {
      count: withEosOutResponseVariant(oscMappings.queries.bp.count),
      list: withEosOutResponseVariant(oscMappings.queries.bp.list)
    },
    preset: {
      count: withEosOutResponseVariant(oscMappings.queries.preset.count),
      list: withEosOutResponseVariant(oscMappings.queries.preset.list)
    },
    sub: {
      count: withEosOutResponseVariant(oscMappings.queries.sub.count),
      list: withEosOutResponseVariant(oscMappings.queries.sub.list)
    },
    fx: {
      count: withEosOutResponseVariant(oscMappings.queries.fx.count),
      list: withEosOutResponseVariant(oscMappings.queries.fx.list)
    },
    curve: {
      count: withEosOutResponseVariant(oscMappings.queries.curve.count),
      list: withEosOutResponseVariant(oscMappings.queries.curve.list)
    },
    snap: {
      count: withEosOutResponseVariant(oscMappings.queries.snap.count),
      list: withEosOutResponseVariant(oscMappings.queries.snap.list)
    },
    pixmap: {
      count: withEosOutResponseVariant(oscMappings.queries.pixmap.count),
      list: withEosOutResponseVariant(oscMappings.queries.pixmap.list)
    }
  },
  patch: {
    channelInfo: withEosOutResponseVariant(oscMappings.patch.channelInfo),
    augment3dPosition: withEosOutResponseVariant(oscMappings.patch.augment3dPosition),
    augment3dBeam: withEosOutResponseVariant(oscMappings.patch.augment3dBeam)
  },
  cues: {
    info: withEosOutResponseVariant(oscMappings.cues.info),
    list: withEosOutResponseVariant(oscMappings.cues.list)
  }
} as const;
