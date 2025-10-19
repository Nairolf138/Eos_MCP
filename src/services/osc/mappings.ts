export const oscMappings = {
  channels: {
    select: '/eos/chan/select',
    level: '/eos/chan/level',
    dmx: '/eos/dmx/level',
    parameter: '/eos/chan/param',
    info: '/eos/get/channels'
  }
} as const;

export type OscMappings = typeof oscMappings;
