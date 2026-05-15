/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
export const oscMappings = {
  commands: {
    command: '/eos/cmd',
    newCommand: '/eos/newcmd',
    getCommandLine: '/eos/get/cmd_line'
  },
  connection: {
    ping: '/eos/ping'
  },
  keys: {
    base: '/eos/key',
    press: '/eos/key/{key}',
    softkey: '/eos/key/softkey{number}',
    softkeyLabels: '/eos/get/softkey_labels'
  },
  channels: {
    command: '/eos/cmd',
    base: '/eos/chan',
    parameter: '/eos/chan/param',
    info: '/eos/get/channels'
  },
  dmx: {
    command: '/eos/cmd',
    addressSelect: '/eos/dmx/address/select',
    addressLevel: '/eos/dmx/address/level',
    addressDmx: '/eos/dmx/address/dmx'
  },
  groups: {
    select: '/eos/group',
    level: '/eos/group/{group}/level',
    info: '/eos/get/group',
    list: '/eos/get/group/list'
  },
  palettes: {
    info: '/eos/get/palette',
    intensity: {
      fire: '/eos/ip/fire',
      info: '/eos/get/ip'
    },
    focus: {
      fire: '/eos/fp/fire',
      info: '/eos/get/fp'
    },
    color: {
      fire: '/eos/cp/fire',
      info: '/eos/get/cp'
    },
    beam: {
      fire: '/eos/bp/fire',
      info: '/eos/get/bp'
    }
  },
  presets: {
    fire: '/eos/preset/fire',
    select: '/eos/preset',
    info: '/eos/get/preset'
  },
  macros: {
    fire: '/eos/macro/fire',
    select: '/eos/macro',
    info: '/eos/get/macro'
  },
  snapshots: {
    recall: '/eos/snap',
    info: '/eos/get/snapshot'
  },
  curves: {
    select: '/eos/curve/select',
    info: '/eos/get/curve'
  },
  effects: {
    select: '/eos/cmd',
    stop: '/eos/cmd',
    info: '/eos/get/effect'
  },
  parameters: {
    wheelTick: '/eos/param/wheel/tick',
    wheelRate: '/eos/param/wheel/rate',
    colorHs: '/eos/param/color/hs',
    colorRgb: '/eos/param/color/rgb',
    positionXY: '/eos/param/position/xy',
    positionXYZ: '/eos/param/position/xyz',
    activeWheels: '/eos/get/active/wheels'
  },
  fpe: {
    getSetCount: '/eos/get/fpe/set/count',
    getSetInfo: '/eos/get/fpe/set',
    getPointInfo: '/eos/get/fpe/point'
  },
  faders: {
    base: '/eos/fader',
    bankCreate: '/eos/fader/{index}/config/{faders}/{page}',
    bankPage: '/eos/fader/{index}/page/{delta}'
  },
  directSelects: {
    base: '/eos/ds/{index}/button/{page}/{button}',
    bankCreate: '/eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page}',
    bankPage: '/eos/ds/{index}/page/{delta}'
  },
  pixelMaps: {
    select: '/eos/pixmap',
    info: '/eos/get/pixmap'
  },
  magicSheets: {
    open: '/eos/ms',
    sendString: '/eos/newcmd',
    info: '/eos/get/magic_sheet'
  },
  queries: {
    cue: {
      count: '/eos/get/cue/count',
      list: '/eos/get/cue/list'
    },
    cuelist: {
      count: '/eos/get/cuelist/count',
      list: '/eos/get/cuelist/list'
    },
    group: {
      count: '/eos/get/group/count',
      list: '/eos/get/group/list'
    },
    macro: {
      count: '/eos/get/macro/count',
      list: '/eos/get/macro/list'
    },
    ms: {
      count: '/eos/get/magic_sheet/count',
      list: '/eos/get/magic_sheet/list'
    },
    ip: {
      count: '/eos/get/ip/count',
      list: '/eos/get/ip/list'
    },
    fp: {
      count: '/eos/get/fp/count',
      list: '/eos/get/fp/list'
    },
    cp: {
      count: '/eos/get/cp/count',
      list: '/eos/get/cp/list'
    },
    bp: {
      count: '/eos/get/bp/count',
      list: '/eos/get/bp/list'
    },
    preset: {
      count: '/eos/get/preset/count',
      list: '/eos/get/preset/list'
    },
    sub: {
      count: '/eos/get/submaster/count',
      list: '/eos/get/submaster/list'
    },
    fx: {
      count: '/eos/get/effect/count',
      list: '/eos/get/effect/list'
    },
    curve: {
      count: '/eos/get/curve/count',
      list: '/eos/get/curve/list'
    },
    snap: {
      count: '/eos/get/snapshot/count',
      list: '/eos/get/snapshot/list'
    },
    pixmap: {
      count: '/eos/get/pixmap/count',
      list: '/eos/get/pixmap/list'
    }
  },
  patch: {
    channelInfo: '/eos/get/patch/chan_info',
    augment3dPosition: '/eos/get/patch/chan_pos',
    augment3dBeam: '/eos/get/patch/chan_beam'
  },
  submasters: {
    base: '/eos/sub',
    info: '/eos/get/submaster'
  },
  cues: {
    fire: '/eos/cmd',
    go: '/eos/cmd',
    stopBackCommand: '/eos/cmd',
    select: '/eos/cmd',
    info: '/eos/get/cue',
    list: '/eos/get/cuelist',
    cuelistInfo: '/eos/get/cuelist/info',
    bankCreate: '/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}',
    bankPage: '/eos/cuelist/{bank_index}/page/{delta}',
    active: '/eos/get/active/cue',
    pending: '/eos/get/pending/cue'
  },
  showControl: {
    showName: '/eos/get/show/name',
    liveBlindState: '/eos/get/live/blind',
    toggleStagingMode: '/eos/newcmd',
    setCueSendString: '/eos/newcmd',
    setCueReceiveString: '/eos/newcmd'
  },
  system: {
    getVersion: '/eos/get/version',
    getSetupDefaults: '/eos/get/setup_defaults',
    setUserId: '/eos/set/user_id'
  }
} as const;

export type OscMappings = typeof oscMappings;

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
