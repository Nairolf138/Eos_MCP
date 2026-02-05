import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { sendDeterministicCommand } from '../commands/command_tools';
import { createCueIdentifierFromOptions, cueNumberSchema, cuelistNumberSchema, formatCueDescription } from '../cues/common';
import type { ToolDefinition, ToolExecutionResult } from '../types';

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

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Erreur inconnue';
}

function buildWorkflowResult(
  workflow: string,
  status: 'ok' | 'partial_failure' | 'failed',
  summary: string,
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>
): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: {
      workflow,
      status,
      executedSteps: steps,
      commandsSent: steps.filter((step) => typeof step.command === 'string').map((step) => step.command),
      partialErrors
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
      targetPort: options.targetPort
    });
    steps.push({ step, status: 'ok', command });
    return true;
  } catch (error) {
    const message = extractErrorMessage(error);
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
        command: options.cuelist_number == null
          ? `Cue ${String(options.cue_number).trim()} Record`
          : `Cue ${options.cuelist_number}/${String(options.cue_number).trim()} Record`
      },
      ...(options.cue_label
        ? [
            {
              step: 'label_cue',
              command: options.cuelist_number == null
                ? `Cue ${String(options.cue_number).trim()} Label "${options.cue_label.replace(/"/g, '\\"')}"`
                : `Cue ${options.cuelist_number}/${String(options.cue_number).trim()} Label "${options.cue_label.replace(/"/g, '\\"')}"`
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

const patchFixtureInputSchema = {
  channel_number: z.coerce.number().int().min(1).max(99999),
  dmx_address: z.string().trim().min(1).max(32),
  device_type: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(128),
  part: z.coerce.number().int().min(1).max(99).optional(),
  position_x: z.coerce.number().finite().optional(),
  position_y: z.coerce.number().finite().optional(),
  position_z: z.coerce.number().finite().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

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
    const part = options.part ?? 1;

    const commands = [
      {
        step: 'patch_fixture',
        command:
          `Patch Chan ${options.channel_number} Part ${part} Address ${options.dmx_address} Type "${options.device_type.replace(/"/g, '\\"')}"`
      },
      {
        step: 'label_fixture',
        command: `Chan ${options.channel_number} Part ${part} Label "${options.label.replace(/"/g, '\\"')}"`
      },
      {
        step: 'set_base_3d_position',
        command:
          `Chan ${options.channel_number} Part ${part} Position X ${options.position_x ?? 0} Y ${options.position_y ?? 0} Z ${options.position_z ?? 0}`
      }
    ];

    for (const commandStep of commands) {
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
      partialErrors
    );
  }
};

const rehearsalGoSafeInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema.optional(),
  rollback_cue_number: cueNumberSchema.optional(),
  rollback_cuelist_number: cuelistNumberSchema.optional(),
  rollback_on_failure: z.boolean().optional(),
  precheck_timeout_ms: z.coerce.number().int().min(50).max(10000).optional(),
  allow_non_empty_command_line: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

export const eosWorkflowRehearsalGoSafeTool: ToolDefinition<typeof rehearsalGoSafeInputSchema> = {
  name: 'eos_workflow_rehearsal_go_safe',
  config: {
    title: 'Workflow rehearsal go safe',
    description: 'Verifie la ligne de commande, envoie GO puis rollback optionnel en cas d echec.',
    inputSchema: rehearsalGoSafeInputSchema
  },
  handler: async (args) => {
    const options = z.object(rehearsalGoSafeInputSchema).strict().parse(args ?? {});
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

export const workflowTools = [
  eosWorkflowCreateLookTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowRehearsalGoSafeTool
] as ToolDefinition[];

export default workflowTools;
