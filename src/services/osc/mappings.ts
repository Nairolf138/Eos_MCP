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
  }
} as const;

export type OscMappings = typeof oscMappings;
