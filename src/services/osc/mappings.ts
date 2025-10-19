export const oscMappings = {
  channels: {
    select: '/eos/chan/select',
    level: '/eos/chan/level',
    dmx: '/eos/dmx/level',
    parameter: '/eos/chan/param',
    info: '/eos/get/channels'
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
    stopBack: '/eos/cue/stop/back',
    select: '/eos/cue/select',
    info: '/eos/get/cue',
    list: '/eos/get/cuelist',
    cuelistInfo: '/eos/get/cuelist/info',
    bankCreate: '/eos/cuelist/bank/create',
    bankPage: '/eos/cuelist/bank/page',
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
