/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { validateCueArgumentsPair, optionalTimeoutMsSchema } from '../../utils/validators';
import { getOscClient } from '../../services/osc/client';
import { sendDeterministicCommand } from '../commands/command_tools';
import {
  buildRecordCueCommand,
  createCueIdentifierFromOptions,
  cueNumberSchema,
  cuelistNumberSchema,
  formatCueDescription,
  formatCueTarget
} from '../cues/common';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  buildPatchSequence,
  executePatchSequence,
  extractPatchSequenceError
} from './patchSequence';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.coerce.number().int().min(0).optional()
} satisfies ZodRawShape;

type WorkflowStepStatus = 'ok' | 'error' | 'skipped';

interface WorkflowStepLog {
  step: string;
  status: WorkflowStepStatus;
  command?: string;
  detail?: string;
  error?: string;
}

function buildWorkflowResult(
  workflow: string,
  status: 'ok' | 'partial_failure' | 'failed',
  summary: string,
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  extraStructuredContent: Record<string, unknown> = {}
): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: {
      workflow,
      status,
      executedSteps: steps,
      commandsSent: steps.filter((step) => typeof step.command === 'string').map((step) => step.command),
      partialErrors,
      ...extraStructuredContent
    }
  };
}

async function runCommandStep(
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  step: string,
  command: string,
  options: { user?: number; targetAddress?: string; targetPort?: number }
): Promise<boolean> {
  try {
    await sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      safety_level: 'off'
    });
    steps.push({ step, status: 'ok', command });
    return true;
  } catch (error) {
    const message = extractPatchSequenceError(error);
    steps.push({ step, status: 'error', command, error: message });
    partialErrors.push({ step, error: message });
    return false;
  }
}

const createLookInputSchema = {
  channels: z.string().trim().min(1).max(256),
  cue_number: cueNumberSchema,
  cuelist_number: cuelistNumberSchema.optional(),
  color_palette: z.coerce.number().int().min(1).max(99999).optional(),
  focus_palette: z.coerce.number().int().min(1).max(99999).optional(),
  beam_palette: z.coerce.number().int().min(1).max(99999).optional(),
  cue_label: z.string().trim().min(1).max(128).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;


const effectDirectionSchema = z.enum(['left_to_right', 'right_to_left', 'center_out']);

type EffectDirection = z.infer<typeof effectDirectionSchema>;

const effectDirectionCommandLabels: Record<EffectDirection, string> = {
  left_to_right: 'Left To Right',
  right_to_left: 'Right To Left',
  center_out: 'Center Out'
};

const createEffectInputSchema = {
  channels: z.string().trim().min(1).max(256),
  effect_number: z.coerce.number().int().min(1).max(9999),
  group_number: z.coerce.number().int().min(1).max(99999).optional(),
  direction: effectDirectionSchema.optional().default('left_to_right'),
  speed: z.coerce.number().finite().positive().max(999).optional().default(1),
  size: z.coerce.number().finite().positive().max(1000).optional().default(100),
  dry_run: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_create_look
 * @summary Workflow creation de look
 * @description Selectionne des canaux, applique des palettes CP/FP/BP puis enregistre une cue.
 * @arguments Voir docs/tools.md#eos-workflow-create-look pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-create-look pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-create-look pour un exemple OSC.
 */
export const eosWorkflowCreateLookTool: ToolDefinition<typeof createLookInputSchema> = {
  name: 'eos_workflow_create_look',
  config: {
    title: 'Workflow creation de look',
    description: 'Selectionne des canaux, applique des palettes CP/FP/BP puis enregistre une cue.',
    inputSchema: createLookInputSchema
  },
  handler: async (args) => {
    const options = z.object(createLookInputSchema).strict().parse(args ?? {});
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];

    const commands = [
      { step: 'select_channels', command: `Chan ${options.channels}` },
      ...(options.color_palette != null ? [{ step: 'apply_color_palette', command: `CP ${options.color_palette}` }] : []),
      ...(options.focus_palette != null ? [{ step: 'apply_focus_palette', command: `FP ${options.focus_palette}` }] : []),
      ...(options.beam_palette != null ? [{ step: 'apply_beam_palette', command: `BP ${options.beam_palette}` }] : []),
      {
        step: 'record_cue',
        command: buildRecordCueCommand(options.cue_number, options.cuelist_number)
      },
      ...(options.cue_label
        ? [
            {
              step: 'label_cue',
              command: `${formatCueTarget(options.cue_number, options.cuelist_number)} Label "${options.cue_label.replace(/"/g, '\\"')}"`
            }
          ]
        : [])
    ];
    for (const commandStep of commands) {
      const ok = await runCommandStep(steps, partialErrors, commandStep.step, commandStep.command, options);
      if (!ok) {
        return buildWorkflowResult(
          'eos_workflow_create_look',
          'partial_failure',
          `Workflow creation look interrompu a l'etape ${commandStep.step}.`,
          steps,
          partialErrors
        );
      }
    }

    return buildWorkflowResult(
      'eos_workflow_create_look',
      'ok',
      'Workflow creation look execute avec succes.',
      steps,
      partialErrors
    );
  }
};

/**
 * @tool eos_workflow_create_effect
 * @summary Workflow creation d'effet
 * @description Enregistre un groupe optionnel, assigne un effet a des canaux, applique speed/size/direction puis enregistre l'effet.
 * @arguments Voir docs/tools.md#eos-workflow-create-effect pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-create-effect pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-create-effect pour un exemple OSC.
 */
export const eosWorkflowCreateEffectTool: ToolDefinition<typeof createEffectInputSchema> = {
  name: 'eos_workflow_create_effect',
  config: {
    title: "Workflow creation d'effet",
    description: "Enregistre un groupe optionnel, assigne un effet a des canaux, applique speed/size/direction puis enregistre l'effet.",
    inputSchema: createEffectInputSchema
  },
  handler: async (args) => {
    const options = z.object(createEffectInputSchema).strict().parse(args ?? {});
    const dryRun = options.dry_run === true;
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];
    const directionLabel = effectDirectionCommandLabels[options.direction];

    const commands = [
      ...(options.group_number != null
        ? [{ step: 'record_group', command: `Chan ${options.channels} Record Group ${options.group_number}` }]
        : []),
      { step: 'assign_effect_to_channels', command: `Chan ${options.channels} Effect ${options.effect_number}` },
      { step: 'apply_speed', command: `Effect ${options.effect_number} Speed ${options.speed}` },
      { step: 'apply_size', command: `Effect ${options.effect_number} Size ${options.size}` },
      { step: 'apply_direction', command: `Effect ${options.effect_number} Direction ${directionLabel}` },
      { step: 'record_effect', command: `Record Effect ${options.effect_number}` }
    ];

    for (const commandStep of commands) {
      commandsPreview.push(commandStep.command);
      if (dryRun) {
        steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: 'dry_run' });
        continue;
      }

      const ok = await runCommandStep(steps, partialErrors, commandStep.step, commandStep.command, options);
      if (!ok) {
        return buildWorkflowResult(
          'eos_workflow_create_effect',
          'partial_failure',
          `Workflow creation effet interrompu a l'etape ${commandStep.step}.`,
          steps,
          partialErrors,
          {
            effect: {
              effect_number: options.effect_number,
              channels: options.channels,
              group_number: options.group_number ?? null,
              parameters: {
                direction: options.direction,
                speed: options.speed,
                size: options.size
              }
            },
            ...(dryRun ? { commands_preview: commandsPreview } : {})
          }
        );
      }
    }

    return buildWorkflowResult(
      'eos_workflow_create_effect',
      'ok',
      dryRun ? 'Dry run creation effet genere.' : 'Workflow creation effet execute avec succes.',
      steps,
      partialErrors,
      {
        effect: {
          effect_number: options.effect_number,
          channels: options.channels,
          group_number: options.group_number ?? null,
          parameters: {
            direction: options.direction,
            speed: options.speed,
            size: options.size
          }
        },
        ...(dryRun ? { commands_preview: commandsPreview } : {})
      }
    );
  }
};


const createCueSeriesInputSchema = {
  base_cuelist_number: cuelistNumberSchema.optional(),
  start_cue_number: cueNumberSchema.optional().default(1),
  looks: z.array(z.object({
    channels: z.string().trim().min(1).max(256),
    color_palette: z.coerce.number().int().min(1).max(99999).optional(),
    focus_palette: z.coerce.number().int().min(1).max(99999).optional(),
    beam_palette: z.coerce.number().int().min(1).max(99999).optional(),
    cue_label: z.string().trim().min(1).max(128).optional()
  })).min(1),
  dry_run: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_create_cue_series
 * @summary Workflow creation serie de cues
 * @description Enchaine plusieurs looks et enregistre une serie de cues auto-incrementees.
 * @arguments Voir docs/tools.md#eos-workflow-create-cue-series pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-create-cue-series pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-create-cue-series pour un exemple OSC.
 */
export const eosWorkflowCreateCueSeriesTool: ToolDefinition<typeof createCueSeriesInputSchema> = {
  name: 'eos_workflow_create_cue_series',
  config: {
    title: 'Workflow creation serie de cues',
    description: 'Enchaine plusieurs looks et enregistre une serie de cues auto-incrementees.',
    inputSchema: createCueSeriesInputSchema
  },
  handler: async (args) => {
    const options = z.object(createCueSeriesInputSchema).strict().parse(args ?? {});
    const dryRun = options.dry_run === true;
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];
    let cueNumber = Number(options.start_cue_number ?? 1);

    for (let index = 0; index < options.looks.length; index += 1) {
      const look = options.looks[index];
      const cueStepPrefix = `look_${index + 1}_cue_${cueNumber}`;
      const commands = [
        { step: `${cueStepPrefix}_select_channels`, command: `Chan ${look.channels}` },
        ...(look.color_palette != null ? [{ step: `${cueStepPrefix}_apply_color_palette`, command: `CP ${look.color_palette}` }] : []),
        ...(look.focus_palette != null ? [{ step: `${cueStepPrefix}_apply_focus_palette`, command: `FP ${look.focus_palette}` }] : []),
        ...(look.beam_palette != null ? [{ step: `${cueStepPrefix}_apply_beam_palette`, command: `BP ${look.beam_palette}` }] : []),
        {
          step: `${cueStepPrefix}_record_cue`,
          command: buildRecordCueCommand(cueNumber, options.base_cuelist_number)
        },
        ...(look.cue_label
          ? [
              {
                step: `${cueStepPrefix}_label_cue`,
                command: `${formatCueTarget(cueNumber, options.base_cuelist_number)} Label "${look.cue_label.replace(/"/g, '\\"')}"`
              }
            ]
          : [])
      ];

      for (const commandStep of commands) {
        commandsPreview.push(commandStep.command);
        if (dryRun) {
          steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: 'dry_run' });
          continue;
        }

        const ok = await runCommandStep(steps, partialErrors, commandStep.step, commandStep.command, options);
        if (!ok) {
          return buildWorkflowResult(
            'eos_workflow_create_cue_series',
            'partial_failure',
            `Workflow creation serie cues interrompu a l'etape ${commandStep.step}.`,
            steps,
            partialErrors,
            { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
          );
        }
      }

      cueNumber += 1;
    }

    return buildWorkflowResult(
      'eos_workflow_create_cue_series',
      'ok',
      dryRun ? 'Dry run creation serie cues genere.' : 'Workflow creation serie cues execute avec succes.',
      steps,
      partialErrors,
      { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
    );
  }
};

const patchFixtureInputSchema = {
  channel_number: z.coerce.number().int().min(1).max(99999),
  dmx_address: z.string().trim().min(1).max(32),
  device_type: z.string().trim().min(1).max(128).optional(),
  fixture_query: z.string().trim().min(1).max(128).optional(),
  fixture_manufacturer: z.string().trim().min(1).max(128).optional(),
  fixture_model: z.string().trim().min(1).max(128).optional(),
  fixture_name: z.string().trim().min(1).max(128).optional(),
  fixture_mode: z.string().trim().min(1).max(128).optional(),
  label: z.string().trim().min(1).max(128),
  part: z.coerce.number().int().min(1).max(99).optional(),
  position_x: z.coerce.number().finite().optional(),
  position_y: z.coerce.number().finite().optional(),
  position_z: z.coerce.number().finite().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_patch_fixture
 * @summary Workflow patch fixture
 * @description Patch un canal, applique un label et une position 3D de base.
 * @arguments Voir docs/tools.md#eos-workflow-patch-fixture pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-patch-fixture pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-patch-fixture pour un exemple OSC.
 */
export const eosWorkflowPatchFixtureTool: ToolDefinition<typeof patchFixtureInputSchema> = {
  name: 'eos_workflow_patch_fixture',
  config: {
    title: 'Workflow patch fixture',
    description: 'Patch un canal, applique un label et une position 3D de base.',
    inputSchema: patchFixtureInputSchema
  },
  handler: async (args) => {
    const options = z.object(patchFixtureInputSchema).strict().parse(args ?? {});
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const execution = buildPatchSequence(options);
    if (execution.fixtureResolution) {
      steps.push({
        step: 'resolve_fixture',
        status: 'ok',
        detail: `${execution.fixtureResolution.fixture.manufacturer} ${execution.fixtureResolution.fixture.model} (${execution.fixtureResolution.mode.name})`
      });
    }

    for (const commandStep of execution.commands) {
      const ok = await runCommandStep(steps, partialErrors, commandStep.step, commandStep.command, options);
      if (!ok) {
        return buildWorkflowResult(
          'eos_workflow_patch_fixture',
          'partial_failure',
          `Workflow patch fixture interrompu a l'etape ${commandStep.step}.`,
          steps,
          partialErrors
        );
      }
    }

    return buildWorkflowResult(
      'eos_workflow_patch_fixture',
      'ok',
      'Workflow patch fixture execute avec succes.',
      steps,
      partialErrors,
      execution.fixtureResolution
        ? {
            fixture_resolution: {
              manufacturer: execution.fixtureResolution.fixture.manufacturer,
              model: execution.fixtureResolution.fixture.model,
              name: execution.fixtureResolution.fixture.name,
              mode: execution.fixtureResolution.mode.name,
              device_type: execution.fixtureResolution.deviceType,
              score: execution.fixtureResolution.score
            }
          }
        : {}
    );
  }
};

const autopatchBandInputSchema = {
  fixtures: z.array(z.object({
    count: z.coerce.number().int().min(1).max(999),
    fixture_query: z.string().trim().min(1).max(128).optional(),
    fixture_manufacturer: z.string().trim().min(1).max(128).optional(),
    fixture_model: z.string().trim().min(1).max(128).optional(),
    fixture_mode: z.string().trim().min(1).max(128).optional(),
    universe: z.coerce.number().int().min(1).max(999),
    start_address: z.coerce.number().int().min(1).max(512),
    label_prefix: z.string().trim().min(1).max(128),
    position_x: z.coerce.number().finite().optional(),
    position_y: z.coerce.number().finite().optional(),
    position_z: z.coerce.number().finite().optional()
  })).min(1),
  include_face_trad: z.boolean().optional(),
  face_trad_count: z.coerce.number().int().min(1).max(999).optional(),
  face_trad_universe: z.coerce.number().int().min(1).max(999).optional(),
  face_trad_start_address: z.coerce.number().int().min(1).max(512).optional(),
  face_trad_label_prefix: z.string().trim().min(1).max(128).optional(),
  dry_run: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_autopatch_band
 * @summary Workflow autopatch band
 * @description Patche sequentiellement plusieurs blocs de fixtures avec option face trad.
 * @arguments Voir docs/tools.md#eos-workflow-autopatch-band pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-autopatch-band pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-autopatch-band pour un exemple OSC.
 */
export const eosWorkflowAutopatchBandTool: ToolDefinition<typeof autopatchBandInputSchema> = {
  name: 'eos_workflow_autopatch_band',
  config: {
    title: 'Workflow autopatch band',
    description: 'Patche sequentiellement plusieurs blocs de fixtures avec option face trad.',
    inputSchema: autopatchBandInputSchema
  },
  handler: async (args) => {
    const options = z.object(autopatchBandInputSchema).strict().parse(args ?? {});
    const dryRun = options.dry_run === true;
    const logs: Array<Record<string, unknown>> = [];
    const commandsPreview: string[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    let channel = 1;

    const groups = [...options.fixtures];
    if (options.include_face_trad === true) {
      groups.push({
        count: options.face_trad_count ?? 4,
        universe: options.face_trad_universe ?? 1,
        start_address: options.face_trad_start_address ?? 1,
        label_prefix: options.face_trad_label_prefix ?? 'Face Trad',
        fixture_query: 'trad'
      });
    }

    for (const group of groups) {
      for (let index = 0; index < group.count; index += 1) {
        const startAddress = group.start_address + (index * 10);
        const dmxAddress = `${group.universe}/${startAddress}`;
        const label = `${group.label_prefix} ${index + 1}`;

        try {
          const execution = buildPatchSequence({
            channel_number: channel,
            dmx_address: dmxAddress,
            fixture_query: group.fixture_query,
            fixture_manufacturer: group.fixture_manufacturer,
            fixture_model: group.fixture_model,
            fixture_mode: group.fixture_mode,
            label,
            position_x: group.position_x,
            position_y: group.position_y,
            position_z: group.position_z,
            targetAddress: options.targetAddress,
            targetPort: options.targetPort,
            user: options.user
          });

          for (const command of execution.commands) {
            commandsPreview.push(command.command);
            if (!dryRun) {
              const executionResult = await executePatchSequence([command], options);
              partialErrors.push(...executionResult.partialErrors);
              if (!executionResult.success) {
                throw new Error(executionResult.partialErrors[executionResult.partialErrors.length - 1]?.error ?? 'Erreur patch');
              }
            }
          }

          logs.push({
            step: `fixture_${channel}`,
            status: 'ok',
            detail: label,
            dmx_start: dmxAddress,
            estimated_end_address: `${group.universe}/${Math.min(startAddress + 9, 512)}`
          });
        } catch (error) {
          const message = extractPatchSequenceError(error);
          logs.push({
            step: `fixture_${channel}`,
            status: 'error',
            detail: label,
            dmx_start: dmxAddress,
            estimated_end_address: `${group.universe}/${Math.min(startAddress + 9, 512)}`,
            error: message
          });
          partialErrors.push({ step: `fixture_${channel}`, error: message });
        }

        channel += 1;
      }
    }

    const hasErrors = logs.some((entry) => entry.status === 'error');
    return buildWorkflowResult(
      'eos_workflow_autopatch_band',
      hasErrors ? 'partial_failure' : 'ok',
      dryRun ? 'Dry run autopatch band genere.' : 'Workflow autopatch band execute.',
      [],
      partialErrors,
      {
        fixture_logs: logs,
        ...(dryRun ? { commands_preview: commandsPreview } : {})
      }
    );
  }
};

const rehearsalGoSafeInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema.optional(),
  rollback_cue_number: cueNumberSchema.optional(),
  rollback_cuelist_number: cuelistNumberSchema.optional(),
  rollback_on_failure: z.boolean().optional(),
  precheck_timeout_ms: optionalTimeoutMsSchema.refine((value) => value == null || value <= 10000, { message: 'precheck_timeout_ms doit etre <= 10000.' }),
  allow_non_empty_command_line: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const buildGroupsAndPalettesInputSchema = {
  groups: z.array(z.object({
    number: z.coerce.number().int().min(1).max(99999),
    label: z.string().trim().min(1).max(128),
    channels: z.string().trim().min(1).max(256)
  })).optional(),
  color_palettes: z.array(z.object({
    number: z.coerce.number().int().min(1).max(99999),
    label: z.string().trim().min(1).max(128),
    channels: z.string().trim().min(1).max(256),
    hue: z.string().trim().min(1).max(128).optional(),
    saturation: z.coerce.number().finite().optional()
  })).optional(),
  focus_palettes: z.array(z.object({
    number: z.coerce.number().int().min(1).max(99999),
    label: z.string().trim().min(1).max(128),
    channels: z.string().trim().min(1).max(256),
    description: z.string().trim().min(1).max(256).optional()
  })).optional(),
  dry_run: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const updateCueLookInputSchema = {
  cuelist_number: cuelistNumberSchema.optional(),
  cue_number: cueNumberSchema.optional(),
  channels: z.string().trim().min(1).max(256),
  intensity_factor: z.coerce.number().finite().positive().optional(),
  desaturate: z.boolean().optional(),
  warmify: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_rehearsal_go_safe
 * @summary Workflow rehearsal go safe
 * @description Verifie la ligne de commande, envoie GO puis rollback optionnel en cas d echec.
 * @arguments Voir docs/tools.md#eos-workflow-rehearsal-go-safe pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-rehearsal-go-safe pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-rehearsal-go-safe pour un exemple OSC.
 */
export const eosWorkflowRehearsalGoSafeTool: ToolDefinition<typeof rehearsalGoSafeInputSchema> = {
  name: 'eos_workflow_rehearsal_go_safe',
  config: {
    title: 'Workflow rehearsal go safe',
    description: 'Verifie la ligne de commande, envoie GO puis rollback optionnel en cas d echec.',
    inputSchema: rehearsalGoSafeInputSchema
  },
  handler: async (args) => {
    const options = z
      .object(rehearsalGoSafeInputSchema)
      .strict()
      .superRefine((value, ctx) => {
        validateCueArgumentsPair(value, ctx);
        if (value.rollback_cuelist_number != null && value.rollback_cue_number == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rollback_cue_number'],
            message: 'rollback_cue_number est obligatoire si rollback_cuelist_number est fourni.'
          });
        }
      })
      .parse(args ?? {});
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const client = getOscClient();

    const precheck = await client.getCommandLine({
      user: options.user,
      timeoutMs: options.precheck_timeout_ms,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    if (precheck.status !== 'ok') {
      const message = precheck.error ?? `Etat non valide: ${precheck.status}`;
      steps.push({ step: 'precheck_console_state', status: 'error', detail: `status=${precheck.status}`, error: message });
      partialErrors.push({ step: 'precheck_console_state', error: message });
      return buildWorkflowResult(
        'eos_workflow_rehearsal_go_safe',
        'failed',
        'Workflow GO safe annule: precheck console en echec.',
        steps,
        partialErrors
      );
    }

    if ((precheck.text ?? '').trim().length > 0 && options.allow_non_empty_command_line !== true) {
      const message = `Ligne de commande non vide: ${precheck.text}`;
      steps.push({ step: 'precheck_console_state', status: 'error', detail: precheck.text, error: message });
      partialErrors.push({ step: 'precheck_console_state', error: message });
      return buildWorkflowResult(
        'eos_workflow_rehearsal_go_safe',
        'failed',
        'Workflow GO safe annule: la ligne de commande doit etre vide.',
        steps,
        partialErrors
      );
    }

    steps.push({ step: 'precheck_console_state', status: 'ok', detail: 'command_line_empty' });

    const goIdentifier = createCueIdentifierFromOptions({
      cuelist_number: options.cuelist_number,
      ...(options.cue_number != null ? { cue_number: options.cue_number } : {})
    });

    const goCommand = options.cue_number == null
      ? `Cue ${options.cuelist_number} Go`
      : `Go To Cue ${options.cuelist_number}/${String(options.cue_number).trim()}`;

    const goOk = await runCommandStep(steps, partialErrors, 'go', goCommand, options);
    if (goOk) {
      return buildWorkflowResult(
        'eos_workflow_rehearsal_go_safe',
        'ok',
        `Workflow GO safe execute pour ${formatCueDescription(goIdentifier)}.`,
        steps,
        partialErrors
      );
    }

    if (options.rollback_on_failure && options.rollback_cue_number != null) {
      const rollbackCommand = options.rollback_cuelist_number == null
        ? `Go To Cue ${String(options.rollback_cue_number).trim()}`
        : `Go To Cue ${options.rollback_cuelist_number}/${String(options.rollback_cue_number).trim()}`;
      const rollbackOk = await runCommandStep(steps, partialErrors, 'rollback', rollbackCommand, options);
      if (!rollbackOk) {
        return buildWorkflowResult(
          'eos_workflow_rehearsal_go_safe',
          'failed',
          'Workflow GO safe en echec: GO et rollback ont echoue.',
          steps,
          partialErrors
        );
      }
    } else {
      steps.push({ step: 'rollback', status: 'skipped', detail: 'rollback_not_requested' });
    }

    return buildWorkflowResult(
      'eos_workflow_rehearsal_go_safe',
      'partial_failure',
      'Workflow GO safe: GO en echec, rollback applique ou ignore selon options.',
      steps,
      partialErrors
    );
  }
};

/**
 * @tool eos_workflow_build_groups_and_palettes
 * @summary Workflow build groups and palettes
 * @description Construit des groupes, color palettes et focus palettes en sequence.
 * @arguments Voir docs/tools.md#eos-workflow-build-groups-and-palettes pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-build-groups-and-palettes pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-build-groups-and-palettes pour un exemple OSC.
 */
export const eosWorkflowBuildGroupsAndPalettesTool: ToolDefinition<typeof buildGroupsAndPalettesInputSchema> = {
  name: 'eos_workflow_build_groups_and_palettes',
  config: {
    title: 'Workflow build groups and palettes',
    description: 'Construit des groupes, color palettes et focus palettes en sequence.',
    inputSchema: buildGroupsAndPalettesInputSchema
  },
  handler: async (args) => {
    const options = z.object(buildGroupsAndPalettesInputSchema).strict().parse(args ?? {});
    const dryRun = options.dry_run === true;
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];

    const queueCommand = async (step: string, command: string): Promise<void> => {
      commandsPreview.push(command);
      if (dryRun) {
        steps.push({ step, status: 'skipped', command, detail: 'dry_run' });
        return;
      }
      await runCommandStep(steps, partialErrors, step, command, options);
    };

    for (const group of options.groups ?? []) {
      await queueCommand(`group_${group.number}_record`, `Chan ${group.channels} Record Group ${group.number}`);
      await queueCommand(`group_${group.number}_label`, `Group ${group.number} Label "${group.label.replace(/"/g, '\\"')}"`);
    }

    for (const palette of options.color_palettes ?? []) {
      await queueCommand(`cp_${palette.number}_select_channels`, `Chan ${palette.channels}`);
      if (palette.hue) await queueCommand(`cp_${palette.number}_set_hue`, `Hue ${palette.hue}`);
      if (palette.saturation != null) await queueCommand(`cp_${palette.number}_set_saturation`, `Saturation ${palette.saturation}`);
      await queueCommand(`cp_${palette.number}_record`, `Record CP ${palette.number}`);
      await queueCommand(`cp_${palette.number}_label`, `CP ${palette.number} Label "${palette.label.replace(/"/g, '\\"')}"`);
    }

    for (const palette of options.focus_palettes ?? []) {
      await queueCommand(`fp_${palette.number}_select_channels`, `Chan ${palette.channels}`);
      if (palette.description) await queueCommand(`fp_${palette.number}_set_description`, palette.description);
      await queueCommand(`fp_${palette.number}_record`, `Record FP ${palette.number}`);
      await queueCommand(`fp_${palette.number}_label`, `FP ${palette.number} Label "${palette.label.replace(/"/g, '\\"')}"`);
    }

    return buildWorkflowResult(
      'eos_workflow_build_groups_and_palettes',
      partialErrors.length > 0 ? 'partial_failure' : 'ok',
      dryRun ? 'Dry run build groups and palettes genere.' : 'Workflow build groups and palettes execute.',
      steps,
      partialErrors,
      { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
    );
  }
};

/**
 * @tool eos_workflow_update_cue_look
 * @summary Workflow update cue look
 * @description Va a une cue, applique des modifications explicites, puis met a jour la cue.
 * @arguments Voir docs/tools.md#eos-workflow-update-cue-look pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-update-cue-look pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-update-cue-look pour un exemple OSC.
 */
export const eosWorkflowUpdateCueLookTool: ToolDefinition<typeof updateCueLookInputSchema> = {
  name: 'eos_workflow_update_cue_look',
  config: {
    title: 'Workflow update cue look',
    description: 'Va a une cue, applique des modifications explicites, puis met a jour la cue.',
    inputSchema: updateCueLookInputSchema
  },
  handler: async (args) => {
    const options = z
      .object(updateCueLookInputSchema)
      .strict()
      .superRefine((value, ctx) => {
        validateCueArgumentsPair(value, ctx);
      })
      .parse(args ?? {});

    const dryRun = options.dry_run === true;
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];
    const updateTarget = options.cuelist_number == null || options.cue_number == null
      ? 'Update Cue'
      : `Update Cue ${options.cuelist_number}/${String(options.cue_number).trim()}`;

    const commands = [
      ...(options.cuelist_number != null && options.cue_number != null
        ? [{ step: 'go_to_cue', command: `Go To Cue ${options.cuelist_number}/${String(options.cue_number).trim()}` }]
        : []),
      { step: 'select_channels', command: `Chan ${options.channels}` },
      ...(options.intensity_factor != null ? [{ step: 'apply_intensity_factor', command: `At * ${options.intensity_factor}` }] : []),
      { step: 'update_cue', command: updateTarget }
    ];

    if (options.desaturate === true) {
      steps.push({
        step: 'apply_desaturate',
        status: 'skipped',
        detail: 'Transformation artistique non calculee en v1: aucune commande implicite envoyee.'
      });
    }

    if (options.warmify === true) {
      steps.push({
        step: 'apply_warmify',
        status: 'skipped',
        detail: 'Transformation artistique non calculee en v1: aucune commande implicite envoyee.'
      });
    }

    for (const commandStep of commands) {
      commandsPreview.push(commandStep.command);
      if (dryRun) {
        steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: 'dry_run' });
        continue;
      }

      const ok = await runCommandStep(steps, partialErrors, commandStep.step, commandStep.command, options);
      if (!ok) {
        return buildWorkflowResult(
          'eos_workflow_update_cue_look',
          'partial_failure',
          `Workflow update cue look interrompu a l'etape ${commandStep.step}.`,
          steps,
          partialErrors
        );
      }
    }

    return buildWorkflowResult(
      'eos_workflow_update_cue_look',
      'ok',
      dryRun ? 'Dry run update cue look genere.' : 'Workflow update cue look execute avec succes.',
      steps,
      partialErrors,
      { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
    );
  }
};

export const workflowTools = [
  eosWorkflowCreateLookTool,
  eosWorkflowCreateEffectTool,
  eosWorkflowCreateCueSeriesTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowAutopatchBandTool,
  eosWorkflowRehearsalGoSafeTool,
  eosWorkflowBuildGroupsAndPalettesTool,
  eosWorkflowUpdateCueLookTool
] as ToolDefinition[];

export default workflowTools;
