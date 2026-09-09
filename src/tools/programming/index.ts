/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { oscMappings } from '../../services/osc/mappings';
import { cueNumberSchema, dmxAddressSchema, userIdSchema } from '../../utils/validators';
import { buildRecordCueCommand, formatCueTarget } from '../cues/common';
import { sendDeterministicCommand } from '../commands/command_tools';
import { buildPatchSequence, applyPatchPlans } from '../workflows/patchSequence';
import type { ToolDefinition } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  user: userIdSchema.optional()
} satisfies ZodRawShape;

const cueListNumberSchema = z.coerce.number().int().min(1).max(999);

const paletteNumberSchema = z.coerce.number().int().min(1).max(99999);

const paletteTypeSchema = z.enum(['ip', 'fp', 'cp', 'bp']);

const channelNumberSchema = z.coerce.number().int().min(1).max(99999);
const partNumberSchema = z.coerce.number().int().min(1).max(99);

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"').trim();
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
        cli: 'Record Cue <cuelist>/<cue>#',
        commandExample: 'Record Cue {cuelist_number}/{cue_number}#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(cueRecordInputSchema).strict().parse(args ?? {});
    const command = buildRecordCueCommand(options.cue_number, options.cuelist_number);
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
        cli: 'Record <IP|FP|CP|BP> <numero>#',
        commandExample: 'Record IP {palette_number}#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(paletteRecordInputSchema).strict().parse(args ?? {});
    const command = `Record ${palettePrefix(options.palette_type)} ${options.palette_number}`;
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
  dmx_address: dmxAddressSchema,
  device_type: z.string().trim().min(1).max(128),
  dmx_footprint: z.coerce.number().int().min(1).max(512).optional(),
  eos_profile: z.string().trim().min(1).max(128).optional(),
  allow_readdress: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  require_confirmation: z.boolean().optional(),
  part: partNumberSchema.optional(),
  label: z.string().trim().min(1).max(128).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_patch_set_channel
 * @summary Set patch channel
 * @description Controle et applique le patch avec relecture. Le profil complexe doit deja exister sur le canal; aucun nom OFL n’est transforme en commande Type.
 * @arguments Voir docs/tools.md#eos-patch-set-channel pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-patch-set-channel pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-patch-set-channel pour un exemple OSC.
 */
export const eosPatchSetChannelTool: ToolDefinition<typeof patchSetChannelInputSchema> = {
  name: 'eos_patch_set_channel',
  config: {
    title: 'Set patch channel',
    description: 'Controle et applique le patch avec relecture. Le profil complexe doit deja exister sur le canal; aucun nom OFL n’est transforme en commande Type.',
    inputSchema: patchSetChannelInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.commands.newCommand,
        cli: 'Address <dmx> At <ch> Part 1#',
        commandExample: 'Address {dmx_address} At {channel_number} Part 1#'
      }
    }
  },
  handler: async (args) => {
    const options = z.object(patchSetChannelInputSchema).strict().parse(args ?? {});
    const execution = buildPatchSequence({ ...options, label: options.label ?? '' });
    return applyPatchPlans([execution.plan], options, 'eos_patch_set_channel');
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
