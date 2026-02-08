import { z, type ZodRawShape } from 'zod';
import { oscMappings } from '../../services/osc/mappings';
import { sendDeterministicCommand } from '../commands/command_tools';
import type { ToolDefinition } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.coerce.number().int().min(0).optional()
} satisfies ZodRawShape;

const cueNumberSchema = z.union([
  z.coerce.number().positive().max(9999),
  z.string().trim().min(1).max(32)
]);

const cueListNumberSchema = z.coerce.number().int().min(1).max(999);

const paletteNumberSchema = z.coerce.number().int().min(1).max(99999);

const paletteTypeSchema = z.enum(['ip', 'fp', 'cp', 'bp']);

const channelNumberSchema = z.coerce.number().int().min(1).max(99999);
const partNumberSchema = z.coerce.number().int().min(1).max(99);

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"').trim();
}

function formatCueTarget(cueNumber: string | number, cuelistNumber?: number): string {
  const cueToken = String(cueNumber).trim();
  if (cuelistNumber == null) {
    return `Cue ${cueToken}`;
  }
  return `Cue ${cuelistNumber}/${cueToken}`;
}

function palettePrefix(type: z.infer<typeof paletteTypeSchema>): string {
  const mapping: Record<z.infer<typeof paletteTypeSchema>, string> = {
    ip: 'IP',
    fp: 'FP',
    cp: 'CP',
    bp: 'BP'
  };
  return mapping[type];
}

const cueRecordInputSchema = {
  cue_number: cueNumberSchema,
  cuelist_number: cueListNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_record
 * @summary Record cue
 * @description Enregistre une cue de maniere deterministe via eos_new_command.
 * @arguments Voir docs/tools.md#eos-cue-record pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-record pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-record pour un exemple OSC.
 */
export const eosCueRecordTool: ToolDefinition<typeof cueRecordInputSchema> = {
  name: 'eos_cue_record',
  config: {
    title: 'Record cue',
    description: 'Enregistre une cue de maniere deterministe via eos_new_command.',
    inputSchema: cueRecordInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: 'Cue <cuelist>/<cue> Record#',
        commandExample: 'Cue {cue_number} Record#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(cueRecordInputSchema).strict().parse(args ?? {});
    const command = `${formatCueTarget(options.cue_number, options.cuelist_number)} Record`;
    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const cueUpdateInputSchema = {
  cue_number: cueNumberSchema,
  cuelist_number: cueListNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_update
 * @summary Update cue
 * @description Met a jour une cue de maniere deterministe via eos_new_command.
 * @arguments Voir docs/tools.md#eos-cue-update pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-update pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-update pour un exemple OSC.
 */
export const eosCueUpdateTool: ToolDefinition<typeof cueUpdateInputSchema> = {
  name: 'eos_cue_update',
  config: {
    title: 'Update cue',
    description: 'Met a jour une cue de maniere deterministe via eos_new_command.',
    inputSchema: cueUpdateInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: 'Update Cue <cuelist>/<cue>#',
        commandExample: 'Update Cue {cue_number}#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(cueUpdateInputSchema).strict().parse(args ?? {});
    const command = `Update ${formatCueTarget(options.cue_number, options.cuelist_number)}`;
    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const cueLabelSetInputSchema = {
  cue_number: cueNumberSchema,
  cuelist_number: cueListNumberSchema.optional(),
  label: z.string().trim().min(1).max(128),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_label_set
 * @summary Label cue
 * @description Applique un label a une cue via une commande EOS deterministe.
 * @arguments Voir docs/tools.md#eos-cue-label-set pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-label-set pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-label-set pour un exemple OSC.
 */
export const eosCueLabelSetTool: ToolDefinition<typeof cueLabelSetInputSchema> = {
  name: 'eos_cue_label_set',
  config: {
    title: 'Label cue',
    description: 'Applique un label a une cue via une commande EOS deterministe.',
    inputSchema: cueLabelSetInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: 'Cue <cuelist>/<cue> Label "<label>"#',
        commandExample: 'Cue {cue_number} Label "{label}"#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(cueLabelSetInputSchema).strict().parse(args ?? {});
    const command = `${formatCueTarget(options.cue_number, options.cuelist_number)} Label "${escapeLabel(options.label)}"`;
    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const paletteRecordInputSchema = {
  palette_type: paletteTypeSchema,
  palette_number: paletteNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_palette_record
 * @summary Record palette
 * @description Enregistre une palette (ip/fp/cp/bp) avec commande deterministe.
 * @arguments Voir docs/tools.md#eos-palette-record pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-palette-record pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-palette-record pour un exemple OSC.
 */
export const eosPaletteRecordTool: ToolDefinition<typeof paletteRecordInputSchema> = {
  name: 'eos_palette_record',
  config: {
    title: 'Record palette',
    description: 'Enregistre une palette (ip/fp/cp/bp) avec commande deterministe.',
    inputSchema: paletteRecordInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: '<IP|FP|CP|BP> <numero> Record#',
        commandExample: 'IP {palette_number} Record#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(paletteRecordInputSchema).strict().parse(args ?? {});
    const command = `${palettePrefix(options.palette_type)} ${options.palette_number} Record`;
    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const paletteLabelSetInputSchema = {
  palette_type: paletteTypeSchema,
  palette_number: paletteNumberSchema,
  label: z.string().trim().min(1).max(128),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_palette_label_set
 * @summary Label palette
 * @description Applique un label sur une palette avec commande deterministe.
 * @arguments Voir docs/tools.md#eos-palette-label-set pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-palette-label-set pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-palette-label-set pour un exemple OSC.
 */
export const eosPaletteLabelSetTool: ToolDefinition<typeof paletteLabelSetInputSchema> = {
  name: 'eos_palette_label_set',
  config: {
    title: 'Label palette',
    description: 'Applique un label sur une palette avec commande deterministe.',
    inputSchema: paletteLabelSetInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: '<IP|FP|CP|BP> <numero> Label "<label>"#',
        commandExample: 'IP {palette_number} Label "{label}"#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(paletteLabelSetInputSchema).strict().parse(args ?? {});
    const command = `${palettePrefix(options.palette_type)} ${options.palette_number} Label "${escapeLabel(options.label)}"`;
    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const patchSetChannelInputSchema = {
  channel_number: channelNumberSchema,
  dmx_address: z.string().trim().min(1).max(32),
  device_type: z.string().trim().min(1).max(128),
  part: partNumberSchema.optional(),
  label: z.string().trim().min(1).max(128).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_patch_set_channel
 * @summary Set patch channel
 * @description Configure adresse DMX, type appareil, part et label via commande deterministe.
 * @arguments Voir docs/tools.md#eos-patch-set-channel pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-patch-set-channel pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-patch-set-channel pour un exemple OSC.
 */
export const eosPatchSetChannelTool: ToolDefinition<typeof patchSetChannelInputSchema> = {
  name: 'eos_patch_set_channel',
  config: {
    title: 'Set patch channel',
    description: 'Configure adresse DMX, type appareil, part et label via commande deterministe.',
    inputSchema: patchSetChannelInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: 'Patch Chan <ch> Part <part> Address <dmx> Type "<type>" [Label "<label>"]#',
        commandExample: 'Patch Chan {channel_number} Part 1 Address {dmx_address} Type "{device_type}"#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(patchSetChannelInputSchema).strict().parse(args ?? {});
    const part = options.part ?? 1;
    const labelCommand = options.label ? ` Label "${escapeLabel(options.label)}"` : '';
    const command = `Patch Chan ${options.channel_number} Part ${part} Address ${options.dmx_address.trim()} Type "${escapeLabel(options.device_type)}"${labelCommand}`;

    return sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
  }
};

const programmingTools = [
  eosCueRecordTool,
  eosCueUpdateTool,
  eosCueLabelSetTool,
  eosPaletteRecordTool,
  eosPaletteLabelSetTool,
  eosPatchSetChannelTool
];

export default programmingTools;
