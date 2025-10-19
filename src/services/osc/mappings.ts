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
  }
} as const;

export type OscMappings = typeof oscMappings;
