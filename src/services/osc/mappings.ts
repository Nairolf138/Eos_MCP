export const oscMappings = {
  channels: {
    select: '/eos/chan/select',
    level: '/eos/chan/level',
    dmx: '/eos/dmx/level',
    parameter: '/eos/chan/param',
    info: '/eos/get/channels'
  },
  dmx: {
    addressSelect: '/eos/dmx/address/select',
    addressLevel: '/eos/dmx/address/level',
    addressDmx: '/eos/dmx/address/dmx'
  },
  groups: {
    select: '/eos/group/select',
    level: '/eos/group/level',
    info: '/eos/group/info',
    list: '/eos/group/list'
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
    select: '/eos/preset/select',
    info: '/eos/get/preset'
  },
  macros: {
    fire: '/eos/macro/fire',
    select: '/eos/macro/select',
    info: '/eos/get/macro'
  },
  snapshots: {
    recall: '/eos/snapshot/recall',
    info: '/eos/get/snapshot'
  },
  curves: {
    select: '/eos/curve/select',
    info: '/eos/get/curve'
  },
  effects: {
    select: '/eos/effect/select',
    stop: '/eos/effect/stop',
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
    bankCreate: '/eos/fader/bank/create',
    bankPage: '/eos/fader/bank/page'
  },
  directSelects: {
    base: '/eos/direct_select/bank',
    bankCreate: '/eos/direct_select/bank/create',
    bankPage: '/eos/direct_select/bank/page'
  },
  pixelMaps: {
    select: '/eos/pixmap/select',
    info: '/eos/get/pixmap'
  },
  magicSheets: {
    open: '/eos/magic_sheet/open',
    sendString: '/eos/magic_sheet/send_string',
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
    fire: '/eos/cue/fire',
    go: '/eos/cue/go',
    stopBack: '/eos/cmd',
    select: '/eos/cue/select',
    info: '/eos/get/cue',
    list: '/eos/get/cuelist',
    cuelistInfo: '/eos/get/cuelist/info',
    bankCreate: {
      list: '/eos/cuelist/{index}/config/list',
      previous: '/eos/cuelist/{index}/config/previous',
      pending: '/eos/cuelist/{index}/config/pending',
      offset: '/eos/cuelist/{index}/config/offset'
    },
    bankPage: '/eos/cuelist/{index}/page/{delta}',
    active: '/eos/get/active/cue',
    pending: '/eos/get/pending/cue'
  },
  showControl: {
    showName: '/eos/get/show/name',
    liveBlindState: '/eos/get/live/blind',
    toggleStagingMode: '/eos/toggle/staging_mode',
    setCueSendString: '/eos/set/cue/send_string',
    setCueReceiveString: '/eos/set/cue/receive_string'
  }
} as const;

export type OscMappings = typeof oscMappings;
