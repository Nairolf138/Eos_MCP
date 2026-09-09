/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { dmxAddressSchema, safeChannelRangeTextSchema, userIdSchema, validateCueArgumentsPair, optionalTimeoutMsSchema } from '../../utils/validators';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { isSensitiveCommandText } from '../common/safety';
import { pollReadback } from '../common/readback';
import { buildCueGoOscRequest } from '../cues/common';
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
  applyPatchPlans,
  type PatchPlan,
  extractPatchSequenceError
} from './patchSequence';
import { showPreparationSchema, prepareShowObjects } from './showPreparation';
import { eosWorkflowPatchScanTool } from './patchScan';
export { eosWorkflowPatchScanTool } from './patchScan';

const primaryWorkflowAnnotations = {
  recommended: true,
  primaryEntryPoint: true
} satisfies Record<string, unknown>;

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  user: userIdSchema.optional(),
  verification_timeout_ms: z.coerce.number().int().positive().max(10000).optional().describe(
    'Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles.'
  )
} satisfies ZodRawShape;

const workflowDryRunSchema = z.boolean().optional().describe(
  "Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true."
);

const workflowRequireConfirmationSchema = z.boolean().optional().describe(
  "Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview."
);

const requireConfirmationMissingDetail = 'require_confirmation=true obligatoire pour executer reellement ce workflow apres validation utilisateur explicite.';

function shouldBlockUnconfirmedExecution(options: { dry_run?: boolean; require_confirmation?: boolean }): boolean {
  return options.dry_run !== true && options.require_confirmation !== true;
}

function previewSkipDetail(dryRun: boolean): string {
  return dryRun ? 'dry_run' : 'require_confirmation_missing';
}

function buildUnconfirmedExecutionResult(
  workflow: string,
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  commandsPreview: string[],
  extraStructuredContent: Record<string, unknown> = {}
): ToolExecutionResult {
  steps.push({
    step: 'require_confirmation',
    status: 'error',
    detail: 'execution_reelle_refusee',
    error: requireConfirmationMissingDetail
  });
  partialErrors.push({ step: 'require_confirmation', error: requireConfirmationMissingDetail });

  return buildWorkflowResult(
    workflow,
    'failed',
    'Execution reelle refusee: relancez le meme workflow avec require_confirmation=true uniquement apres validation utilisateur explicite de commands_preview.',
    steps,
    partialErrors,
    { commands_preview: commandsPreview, ...extraStructuredContent }
  );
}

function workflowObject<T extends ZodRawShape>(shape: T): z.ZodObject<T, 'strict'> {
  return z.object(shape).strict();
}

type WorkflowStepStatus = 'ok' | 'error' | 'skipped';

interface WorkflowStepLog {
  step: string;
  status: WorkflowStepStatus;
  command?: string;
  detail?: string;
  error?: string;
}

interface WorkflowAppliedDefault {
  step: string;
  detail: string;
}

interface WorkflowWarning {
  step: string;
  detail: string;
}

function isDefaultStep(step: WorkflowStepLog): boolean {
  return step.step.startsWith('default_') || step.step.includes('_default_');
}

function buildAppliedDefaults(steps: WorkflowStepLog[]): WorkflowAppliedDefault[] {
  return steps
    .filter((step) => isDefaultStep(step) && typeof step.detail === 'string')
    .map((step) => ({ step: step.step, detail: step.detail! }));
}

function buildWarnings(steps: WorkflowStepLog[], partialErrors: Array<{ step: string; error: string }>): WorkflowWarning[] {
  const skippedWarnings = steps
    .filter((step) =>
      step.status === 'skipped'
      && typeof step.detail === 'string'
      && step.detail !== 'dry_run'
      && step.detail !== 'dry_run_conditional_on_go_failure'
      && step.detail !== 'rollback_not_requested'
      && !isDefaultStep(step)
    )
    .map((step) => ({ step: step.step, detail: step.detail! }));

  return [
    ...skippedWarnings,
    ...partialErrors.map((entry) => ({ step: entry.step, detail: entry.error }))
  ];
}

function buildWorkflowResult(
  workflow: string,
  status: 'ok' | 'partial_failure' | 'failed',
  summary: string,
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  extraStructuredContent: Record<string, unknown> = {}
): ToolExecutionResult {
  const { commands_preview: explicitCommandsPreview, ...restStructuredContent } = extraStructuredContent;
  const commandLog = steps
    .filter((step) => typeof step.command === 'string')
    .map((step) => ({
      step: step.step,
      status: step.status,
      command: step.command,
      ...(step.detail != null ? { detail: step.detail } : {}),
      ...(step.error != null ? { error: step.error } : {})
    }));
  const commandsPreview = Array.isArray(explicitCommandsPreview)
    ? explicitCommandsPreview.filter((command): command is string => typeof command === 'string')
    : commandLog.map((step) => step.command);

  const simulated = status === 'ok' && steps.some(step => step.detail === 'dry_run');
  return {
    isError: status !== 'ok',
    content: [{ type: 'text', text: summary }],
    structuredContent: {
      verified: false,
      limitations: ['La presence et le label des cues peuvent etre relus; les valeurs enregistrees et le rendu lumineux ne sont pas verifies par ce workflow.'],
      workflow,
      status: simulated ? 'dry_run' : status,
      dry_run: simulated,
      steps,
      executedSteps: steps,
      commands_preview: commandsPreview,
      applied_defaults: buildAppliedDefaults(steps),
      warnings: buildWarnings(steps, partialErrors),
      command_log: commandLog,
      commandsSent: commandLog
        .filter((step) => step.status !== 'skipped')
        .map((step) => step.command),
      partialErrors,
      ...restStructuredContent
    }
  };
}


function pushDefaultLog(steps: WorkflowStepLog[], step: string, detail: string): void {
  steps.push({ step, status: 'ok', detail });
}

function resolveNumericCueNumber(value: string | number, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} doit etre numerique pour permettre l auto-increment.`);
  }
  return numeric;
}

async function readCue(cueNumber: string | number, cuelistNumber: number, options: WorkflowCommandStepOptions, timeoutMs?: number) {
  return getOscClient().requestJson(oscMappings.cues.info, {
    payload: { cue: cueNumber, cuelist: cuelistNumber, part: 0 },
    targetAddress: options.targetAddress, targetPort: options.targetPort,
    timeoutMs: timeoutMs ?? options.verification_timeout_ms ?? 1000
  });
}

async function requireFreeCueTargets(cues: Array<string | number>, list: number, options: WorkflowCommandStepOptions): Promise<void> {
  if (new Set(cues.map(Number)).size !== cues.length) throw new Error('Numeros de cues dupliques dans le plan.');
  for (const cue of cues) {
    const response = await readCue(cue, list, options);
    if ((response.data as {exists?: boolean} | null)?.exists !== false) {
      throw new Error(response.status === 'ok' ? `Cue ${list}/${cue} deja presente: creation refusee.` : `Preflight cue ${list}/${cue} incomplet: ${response.error ?? response.status}`);
    }
  }
}

async function verifyCueExistsAfterRecord(cueNumber: string | number, cuelistNumber: number, options: WorkflowCommandStepOptions) {
  const matches = (data: unknown) => {
    const cue = data as {number?: number; cuelist?: number; exists?: boolean} | null;
    return cue?.exists === true && cue.number === Number(cueNumber) && cue.cuelist === cuelistNumber;
  };
  const response = await pollReadback(remaining => readCue(cueNumber, cuelistNumber, options, remaining), matches, options.verification_timeout_ms ?? 1000);
  return response.status === 'ok' && matches(response.data)
    ? {ok:true, detail:'Presence de la cue relue dans Eos; valeurs enregistrees non verifiees.'}
    : {ok:false, detail:'Cue absente ou lecture incomplete apres Record.', error:response.error ?? 'commande envoyée mais non vérifiée dans EOS'};
}

interface NativeCueLabel { cue: string | number; list: number; label: string }
function cueLabelPreview(value: NativeCueLabel): string { return `/eos/set/cue/${value.list}/${value.cue}/label ${JSON.stringify(value.label)}`; }
async function runNativeStep(steps: WorkflowStepLog[], errors: Array<{step:string;error:string}>, step: string, address: string, options: WorkflowCommandStepOptions, label?: NativeCueLabel): Promise<boolean> {
  const command = label ? cueLabelPreview(label) : address;
  try {
    await getOscClient().sendMessage(address, label ? [{type:'s',value:label.label}] : [], {targetAddress:options.targetAddress,targetPort:options.targetPort});
    if (label) {
      const response = await pollReadback(remaining => readCue(label.cue,label.list,options,remaining), data => (data as {label?:string} | null)?.label === label.label, options.verification_timeout_ms ?? 1000);
      if (response.status !== 'ok' || (response.data as {label?:string} | null)?.label !== label.label) throw new Error('Label cue non confirme apres envoi.');
    }
    steps.push({step,status:'ok',command}); return true;
  } catch(error) {
    const message = extractPatchSequenceError(error); steps.push({step,status:'error',command,error:message}); errors.push({step,error:message}); return false;
  }
}

async function verifyRecordCueStep(
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  step: string,
  cueNumber: string | number,
  cuelistNumber: number,
  options: WorkflowCommandStepOptions
): Promise<boolean> {
  try {
    const verification = await verifyCueExistsAfterRecord(cueNumber, cuelistNumber, options);
    if (verification.ok) {
      steps.push({ step: `${step}_verify`, status: 'ok', detail: verification.detail });
      return true;
    }

    const error = verification.error ?? 'commande envoyée mais non vérifiée dans EOS';
    steps.push({ step: `${step}_verify`, status: 'error', detail: verification.detail, error });
    partialErrors.push({ step: `${step}_verify`, error });
    return false;
  } catch (error) {
    const message = extractPatchSequenceError(error) || 'commande envoyée mais non vérifiée dans EOS';
    steps.push({ step: `${step}_verify`, status: 'error', detail: 'verification cue exception', error: message });
    partialErrors.push({ step: `${step}_verify`, error: message });
    return false;
  }
}

interface WorkflowCommandStepOptions {
  user?: number;
  targetAddress?: string;
  targetPort?: number;
  verification_timeout_ms?: number;
}

interface WorkflowRunCommandStepOptions {
  verify_after_send?: boolean;
}

function commandStepRequiresVerification(command: string, options: WorkflowRunCommandStepOptions = {}): boolean {
  return options.verify_after_send ?? isSensitiveCommandText(command);
}

function getWorkflowCommandVerificationError(result: ToolExecutionResult, requireVerification: boolean): string | null {
  if (!requireVerification) {
    return null;
  }

  const structuredContent = result.structuredContent ?? {};
  if (structuredContent.accepted_by_eos === true) {
    return null;
  }

  const verification = structuredContent.verification;
  const warning = Array.isArray(structuredContent.warnings)
    ? structuredContent.warnings.find((entry): entry is { detail: string } => (
        typeof entry === 'object' && entry !== null && typeof (entry as { detail?: unknown }).detail === 'string'
      ))?.detail
    : undefined;

  if (verification && typeof verification === 'object' && !Array.isArray(verification)) {
    const verificationWarning = (verification as { warning?: unknown }).warning;
    if (typeof verificationWarning === 'string' && verificationWarning.length > 0) {
      return verificationWarning;
    }
  }

  return warning ?? 'commande envoyée mais non vérifiée dans EOS';
}

async function runCommandStep(
  steps: WorkflowStepLog[],
  partialErrors: Array<{ step: string; error: string }>,
  step: string,
  command: string,
  options: WorkflowCommandStepOptions,
  stepOptions: WorkflowRunCommandStepOptions = {}
): Promise<boolean> {
  const verifyAfterSend = commandStepRequiresVerification(command, stepOptions);

  try {
    const result = await sendDeterministicCommand({
      command,
      clearLine: true,
      terminateWithEnter: true,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      verification_timeout_ms: options.verification_timeout_ms,
      verify_after_send: verifyAfterSend,
      safety_level: 'off'
    });
    const verificationError = getWorkflowCommandVerificationError(result, verifyAfterSend);
    if (verificationError != null) {
      steps.push({ step, status: 'error', command, detail: 'verification_after_send_failed', error: verificationError });
      partialErrors.push({ step, error: verificationError });
      return false;
    }

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
  channels: safeChannelRangeTextSchema,
  cue_number: cueNumberSchema,
  cuelist_number: cuelistNumberSchema,
  color_palette: z.coerce.number().int().min(1).max(99999).optional(),
  focus_palette: z.coerce.number().int().min(1).max(99999).optional(),
  beam_palette: z.coerce.number().int().min(1).max(99999).optional(),
  cue_label: z.string().trim().min(1).max(128).optional(),
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;


const effectDirectionSchema = z.enum(['left_to_right', 'right_to_left', 'center_out']);

const createEffectInputSchema = {
  channels: safeChannelRangeTextSchema,
  effect_number: z.coerce.number().int().min(1).max(9999),
  group_number: z.coerce.number().int().min(1).max(99999).optional(),
  direction: effectDirectionSchema.optional().default('left_to_right'),
  speed: z.coerce.number().finite().positive().max(999).optional().default(1),
  size: z.coerce.number().finite().positive().max(1000).optional().default(100),
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
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
    const options = workflowObject(createLookInputSchema).parse(args ?? {});
    const dryRun = options.dry_run === true;
    const blockUnconfirmedExecution = shouldBlockUnconfirmedExecution(options);
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];

    if (options.cuelist_number == null) {
      pushDefaultLog(steps, 'default_cuelist_number', 'cuelist_number absent: utilisation automatique de la cuelist master.');
    }

    if (!dryRun && !blockUnconfirmedExecution) await requireFreeCueTargets([options.cue_number], options.cuelist_number, options);

    const commands = [
      { step: 'select_channels', command: `Chan ${options.channels}` },
      ...(options.color_palette != null ? [{ step: 'apply_color_palette', command: `CP ${options.color_palette}` }] : []),
      ...(options.focus_palette != null ? [{ step: 'apply_focus_palette', command: `FP ${options.focus_palette}` }] : []),
      ...(options.beam_palette != null ? [{ step: 'apply_beam_palette', command: `BP ${options.beam_palette}` }] : []),
      {
        step: 'record_cue',
        command: buildRecordCueCommand(options.cue_number, options.cuelist_number),
        verifyCue: { cueNumber: options.cue_number, cuelistNumber: options.cuelist_number }
      },
      ...(options.cue_label
        ? [
            {
              step: 'label_cue',
              command: cueLabelPreview({cue:options.cue_number,list:options.cuelist_number,label:options.cue_label}),
              nativeLabel: {cue:options.cue_number,list:options.cuelist_number,label:options.cue_label}
            }
          ]
        : [])
    ];
    for (const commandStep of commands) {
      commandsPreview.push(commandStep.command);
      if (dryRun || blockUnconfirmedExecution) {
        steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: previewSkipDetail(dryRun) });
        continue;
      }

      const ok = 'nativeLabel' in commandStep && commandStep.nativeLabel
        ? await runNativeStep(steps, partialErrors, commandStep.step, `/eos/set/cue/${commandStep.nativeLabel.list}/${commandStep.nativeLabel.cue}/label`, options, commandStep.nativeLabel)
        : await runCommandStep(
        steps,
        partialErrors,
        commandStep.step,
        commandStep.command,
        options,
        { verify_after_send: ('verifyCue' in commandStep && commandStep.verifyCue != null) ? false : undefined }
      );
      if (!ok) {
        return buildWorkflowResult(
          'eos_workflow_create_look',
          'partial_failure',
          `Workflow creation look interrompu a l'etape ${commandStep.step}.`,
          steps,
          partialErrors
        );
      }

      if ('verifyCue' in commandStep && commandStep.verifyCue != null) {
        const verified = await verifyRecordCueStep(
          steps,
          partialErrors,
          commandStep.step,
          commandStep.verifyCue.cueNumber,
          commandStep.verifyCue.cuelistNumber,
          options
        );
        if (!verified) {
          return buildWorkflowResult(
            'eos_workflow_create_look',
            'partial_failure',
            'Workflow creation look interrompu: commande envoyée mais non vérifiée dans EOS.',
            steps,
            partialErrors
          );
        }
      }
    }

    if (blockUnconfirmedExecution) {
      return buildUnconfirmedExecutionResult('eos_workflow_create_look', steps, partialErrors, commandsPreview);
    }

    return buildWorkflowResult(
      'eos_workflow_create_look',
      'ok',
      dryRun ? 'Dry run creation look genere.' : 'Workflow creation look execute avec succes.',
      steps,
      partialErrors,
      { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
    );
  }
};

/**
 * @tool eos_workflow_create_effect
 * @summary Creer un effet fly-out
 * @description Indisponible: preparer l effet dans Eos. Cet export de compatibilite n est pas publie au catalogue MCP.
 * @arguments Voir docs/tools.md#eos-workflow-create-effect pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-create-effect pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-create-effect pour un exemple OSC.
 */
export const eosWorkflowCreateEffectTool: ToolDefinition<typeof createEffectInputSchema> = {
  name: 'eos_workflow_create_effect',
  config: {
    title: 'Creer un effet fly-out',
    description: "Indisponible et retire du catalogue: creation generique d effet sans sequence ETC validee. Utiliser l editeur Effets Eos.",
    inputSchema: createEffectInputSchema
  },
  handler: async (args) => {
          const options = z.object(createEffectInputSchema).strict().parse(args ?? {});
          return {
            isError: true,
            content: [{ type: 'text', text: 'Creation generique de fly-out indisponible: preparer le type, les etapes et le regroupement dans l editeur Effets Eos. Aucune commande envoyee.' }],
            structuredContent: {
              status: 'unsupported', verified: false, sent_to_transport: false,
              accepted_by_eos: null, commandsSent: [], commands_preview: [],
              requested_effect: options,
              limitations: ['La creation et les parametres direction/speed/size de cet ancien workflow ne reposaient pas sur une sequence ETC validee.'],
              next_actions: ['Preparer un effet dans Eos, puis utiliser eos_effect_select ou une macro console verifiee.']
            }
          };
        }
};


const safeIntensityTextSchema = z.string().trim().min(1).max(32).refine((value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric >= 0 && numeric <= 100;
  }

  return /^(?:Full|Out|On|Home|FL)$/i.test(value);
}, 'intensity doit etre Full, Out, On, Home, FL ou une valeur numerique de 0 a 100.');

const cueSeriesIntensitySchema = z.union([
  z.number().finite().min(0).max(100),
  safeIntensityTextSchema
]);

function formatCueSeriesIntensity(value: string | number | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return value.trim();
}

const createCueSeriesInputSchema = {
  base_cuelist_number: cuelistNumberSchema,
  start_cue_number: cueNumberSchema.optional().default(1),
  looks: z.array(workflowObject({
    channels: safeChannelRangeTextSchema,
    cue_number: cueNumberSchema.optional(),
    intensity: cueSeriesIntensitySchema.optional(),
    level: cueSeriesIntensitySchema.optional(),
    color_palette: z.coerce.number().int().min(1).max(99999).optional(),
    focus_palette: z.coerce.number().int().min(1).max(99999).optional(),
    beam_palette: z.coerce.number().int().min(1).max(99999).optional(),
    cue_label: z.string().trim().min(1).max(128).optional()
  })).min(1),
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_create_cue_series
 * @summary Programmer une suite de cues reggae
 * @description Point d entree naturel pour generer plusieurs cues musicales ou reggae: looks successifs, palettes couleur/focus/beam et numerotation automatique.
 * @arguments Voir docs/tools.md#eos-workflow-create-cue-series pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-create-cue-series pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-create-cue-series pour un exemple OSC.
 */
export const eosWorkflowCreateCueSeriesTool: ToolDefinition<typeof createCueSeriesInputSchema> = {
  name: 'eos_workflow_create_cue_series',
  config: {
    title: 'Programmer une suite de cues reggae',
    description: 'Point d entree naturel pour generer plusieurs cues musicales ou reggae: looks successifs, palettes couleur/focus/beam et numerotation automatique.',
    annotations: primaryWorkflowAnnotations,
    inputSchema: createCueSeriesInputSchema
  },
  handler: async (args) => {
    const rawArgs = (args ?? {}) as Record<string, unknown>;
    const options = workflowObject(createCueSeriesInputSchema).parse(rawArgs);
    const dryRun = options.dry_run === true;
    const blockUnconfirmedExecution = shouldBlockUnconfirmedExecution(options);
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];
    let cueNumber = resolveNumericCueNumber(options.start_cue_number, 'start_cue_number');

    if (rawArgs.base_cuelist_number == null) {
      pushDefaultLog(steps, 'default_base_cuelist_number', 'base_cuelist_number absent: utilisation automatique de la cuelist master.');
    }

    if (rawArgs.start_cue_number == null) {
      pushDefaultLog(steps, 'default_start_cue_number', 'start_cue_number absent: valeur par defaut 1 appliquee automatiquement.');
    }

    const targets = options.looks.map(look => {
      const current = cueNumberSchema.parse(look.cue_number ?? cueNumber);
      cueNumber = Number(current) + 1;
      if (look.intensity != null && look.level != null && String(look.intensity) !== String(look.level)) throw new Error('intensity et level contradictoires.');
      return current;
    });
    if (new Set(targets.map(Number)).size !== targets.length) throw new Error('Numeros de cues dupliques dans le plan.');
    if (!dryRun && !blockUnconfirmedExecution) await requireFreeCueTargets(targets, options.base_cuelist_number, options);

    for (let index = 0; index < options.looks.length; index += 1) {
      const look = options.looks[index];
      const effectiveCueNumber = targets[index];
      if (look.cue_number == null) {
        pushDefaultLog(steps, `look_${index + 1}_default_cue_number`, `cue_number absent: auto-increment applique avec la valeur ${effectiveCueNumber}.`);
      }
      const cueStepPrefix = `look_${index + 1}_cue_${effectiveCueNumber}`;
      const intensity = formatCueSeriesIntensity(look.intensity ?? look.level);
      const commands = [
        {
          step: `${cueStepPrefix}_select_channels`,
          command: intensity != null ? `Chan ${look.channels} At ${intensity}` : `Chan ${look.channels}`
        },
        ...(look.color_palette != null ? [{ step: `${cueStepPrefix}_apply_color_palette`, command: `CP ${look.color_palette}` }] : []),
        ...(look.focus_palette != null ? [{ step: `${cueStepPrefix}_apply_focus_palette`, command: `FP ${look.focus_palette}` }] : []),
        ...(look.beam_palette != null ? [{ step: `${cueStepPrefix}_apply_beam_palette`, command: `BP ${look.beam_palette}` }] : []),
        {
          step: `${cueStepPrefix}_record_cue`,
          command: buildRecordCueCommand(effectiveCueNumber, options.base_cuelist_number),
          verifyCue: { cueNumber: effectiveCueNumber, cuelistNumber: options.base_cuelist_number }
        },
        ...(look.cue_label
          ? [
              {
                step: `${cueStepPrefix}_label_cue`,
                command: cueLabelPreview({cue:effectiveCueNumber,list:options.base_cuelist_number,label:look.cue_label}),
                nativeLabel: {cue:effectiveCueNumber,list:options.base_cuelist_number,label:look.cue_label}
              }
            ]
          : [])
      ];

      for (const commandStep of commands) {
        commandsPreview.push(commandStep.command);
        if (dryRun || blockUnconfirmedExecution) {
          steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: previewSkipDetail(dryRun) });
          continue;
        }

        const ok = 'nativeLabel' in commandStep && commandStep.nativeLabel
        ? await runNativeStep(steps, partialErrors, commandStep.step, `/eos/set/cue/${commandStep.nativeLabel.list}/${commandStep.nativeLabel.cue}/label`, options, commandStep.nativeLabel)
        : await runCommandStep(
          steps,
          partialErrors,
          commandStep.step,
          commandStep.command,
          options,
          { verify_after_send: ('verifyCue' in commandStep && commandStep.verifyCue != null) ? false : undefined }
        );
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

        if ('verifyCue' in commandStep && commandStep.verifyCue != null) {
          const verified = await verifyRecordCueStep(
            steps,
            partialErrors,
            commandStep.step,
            commandStep.verifyCue.cueNumber,
            commandStep.verifyCue.cuelistNumber,
            options
          );
          if (!verified) {
            return buildWorkflowResult(
              'eos_workflow_create_cue_series',
              'partial_failure',
              'Workflow creation serie cues interrompu: commande envoyée mais non vérifiée dans EOS.',
              steps,
              partialErrors,
              { ...(dryRun ? { commands_preview: commandsPreview } : {}) }
            );
          }
        }
      }

      cueNumber = resolveNumericCueNumber(effectiveCueNumber, `looks[${index}].cue_number`) + 1;
    }

    if (blockUnconfirmedExecution) {
      return buildUnconfirmedExecutionResult('eos_workflow_create_cue_series', steps, partialErrors, commandsPreview);
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
  dmx_address: dmxAddressSchema,
  dmx_footprint: z.coerce.number().int().min(1).max(512).optional(),
  eos_profile: z.string().trim().min(1).max(128).optional(),
  allow_readdress: z.boolean().optional(),
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
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_patch_fixture
 * @summary Workflow patch fixture
 * @description Controle puis applique adresse, label et XYZ optionnel. Profils complexes a preparer dans Eos; user 1..99 requis.
 * @arguments Voir docs/tools.md#eos-workflow-patch-fixture pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-patch-fixture pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-patch-fixture pour un exemple OSC.
 */
export const eosWorkflowPatchFixtureTool: ToolDefinition<typeof patchFixtureInputSchema> = {
  name: 'eos_workflow_patch_fixture',
  config: {
    title: 'Workflow patch fixture',
    description: 'Controle puis applique adresse, label et XYZ optionnel. Profils complexes a preparer dans Eos; user 1..99 requis.',
    inputSchema: patchFixtureInputSchema
  },
  handler: async (args) => {
    const options = workflowObject(patchFixtureInputSchema).parse(args ?? {});
    const execution = buildPatchSequence(options);
    return applyPatchPlans([execution.plan], options, 'eos_workflow_patch_fixture');
  }
};

const autopatchBandInputSchema = {
  start_channel: z.coerce.number().int().min(1).max(99999).optional(),
  allow_readdress: z.boolean().optional(),
  universe_rollover: z.boolean().optional(),
  fixtures: z.array(workflowObject({
    start_channel: z.coerce.number().int().min(1).max(99999).optional(),
    dmx_footprint: z.coerce.number().int().min(1).max(512).optional(),
    eos_profile: z.string().trim().min(1).max(128).optional(),
    device_type: z.string().trim().min(1).max(128).optional(),
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
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_workflow_autopatch_band
 * @summary Patch complet du groupe sur scene
 * @description Prepare un plan par empreinte DMX exacte puis verifie collisions et profils Eos avant toute ecriture. start_channel preserve la numerotation; pas de changement de profil implicite.
 * @arguments Voir docs/tools.md#eos-workflow-autopatch-band pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-autopatch-band pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-autopatch-band pour un exemple OSC.
 */
export const eosWorkflowAutopatchBandTool: ToolDefinition<typeof autopatchBandInputSchema> = {
  name: 'eos_workflow_autopatch_band',
  config: {
    title: 'Patch complet du groupe sur scene',
    description: 'Prepare un plan par empreinte DMX exacte puis verifie collisions et profils Eos avant toute ecriture. start_channel preserve la numerotation; pas de changement de profil implicite.',
    annotations: primaryWorkflowAnnotations,
    inputSchema: autopatchBandInputSchema
  },
  handler: async (args) => {
    const options = workflowObject(autopatchBandInputSchema).parse(args ?? {});
    let channel = options.start_channel ?? 1;
    const plans: PatchPlan[] = [];
    const groups = [...options.fixtures];
    if (options.include_face_trad) {
      if (options.face_trad_count === undefined || options.face_trad_universe === undefined || options.face_trad_start_address === undefined) throw new Error('Preciser nombre, univers et adresse de la face trad; aucune adresse par defaut.');
      groups.push({ count: options.face_trad_count, universe: options.face_trad_universe, start_address: options.face_trad_start_address, label_prefix: options.face_trad_label_prefix ?? 'Face', device_type: 'Dimmer', dmx_footprint: 1 });
    }
    for (const group of groups) {
      channel = group.start_channel ?? channel;
      let universe = group.universe;
      let slot = group.start_address;
      // Resolve the footprint before allocating consecutive addresses.
      const sample = buildPatchSequence({ ...group, channel_number: channel, dmx_address: `${universe}/1`, label: group.label_prefix });
      for (let index = 0; index < group.count; index++) {
        if (slot + sample.plan.footprint - 1 > 512) {
          if (!options.universe_rollover) throw new Error(`Bloc ${group.label_prefix}: depassement d’univers. Corriger le plan ou demander universe_rollover=true.`);
          universe++; slot = 1;
        }
        const execution = buildPatchSequence({ ...group, channel_number: channel++, dmx_address: `${universe}/${slot}`, label: `${group.label_prefix} ${index + 1}` });
        plans.push(execution.plan);
        slot += execution.plan.footprint;
      }
    }
    return applyPatchPlans(plans, options, 'eos_workflow_autopatch_band');
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
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const buildGroupsAndPalettesInputSchema = showPreparationSchema;

const updateCueLookInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema,
  channels: safeChannelRangeTextSchema,
  intensity: z.coerce.number().finite().min(0).max(100),
  intensity_factor: z.coerce.number().finite().positive().optional(),
  desaturate: z.boolean().optional(),
  warmify: z.boolean().optional(),
  dry_run: workflowDryRunSchema,
  require_confirmation: workflowRequireConfirmationSchema,
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
    const options = workflowObject(rehearsalGoSafeInputSchema)
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
    const dryRun = options.dry_run === true;
    const blockUnconfirmedExecution = shouldBlockUnconfirmedExecution(options);
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];

    const goIdentifier = createCueIdentifierFromOptions({
      cuelist_number: options.cuelist_number,
      ...(options.cue_number != null ? { cue_number: options.cue_number } : {})
    });

    const goCommand = buildCueGoOscRequest(goIdentifier).message.address;
    const rollbackCommand = options.rollback_on_failure && options.rollback_cue_number != null
      ? buildCueGoOscRequest(createCueIdentifierFromOptions({cuelist_number:options.rollback_cuelist_number ?? options.cuelist_number,cue_number:options.rollback_cue_number})).message.address
      : null;
    const commandsPreview = rollbackCommand == null ? [goCommand] : [goCommand, rollbackCommand];

    if (blockUnconfirmedExecution) {
      steps.push({ step: 'precheck_console_state', status: 'skipped', detail: 'require_confirmation_missing' });
      steps.push({ step: 'go', status: 'skipped', command: goCommand, detail: 'require_confirmation_missing' });
      if (rollbackCommand != null) {
        steps.push({ step: 'rollback', status: 'skipped', command: rollbackCommand, detail: 'require_confirmation_missing' });
      } else {
        steps.push({ step: 'rollback', status: 'skipped', detail: 'rollback_not_requested' });
      }
      return buildUnconfirmedExecutionResult('eos_workflow_rehearsal_go_safe', steps, partialErrors, commandsPreview);
    }

    if (dryRun) {
      steps.push({ step: 'precheck_console_state', status: 'skipped', detail: 'dry_run' });
      steps.push({ step: 'go', status: 'skipped', command: goCommand, detail: 'dry_run' });
      if (rollbackCommand != null) {
        steps.push({ step: 'rollback', status: 'skipped', command: rollbackCommand, detail: 'dry_run_conditional_on_go_failure' });
      } else {
        steps.push({ step: 'rollback', status: 'skipped', detail: 'rollback_not_requested' });
      }
      return buildWorkflowResult(
        'eos_workflow_rehearsal_go_safe',
        'ok',
        `Dry run GO safe genere pour ${formatCueDescription(goIdentifier)}.`,
        steps,
        partialErrors,
        { commands_preview: commandsPreview }
      );
    }

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

    const goOk = await runNativeStep(steps, partialErrors, 'go', goCommand, options);
    if (goOk) {
      return buildWorkflowResult(
        'eos_workflow_rehearsal_go_safe',
        'ok',
        `Workflow GO safe execute pour ${formatCueDescription(goIdentifier)}.`,
        steps,
        partialErrors
      );
    }

    if (rollbackCommand != null) {
      const rollbackOk = await runNativeStep(steps, partialErrors, 'rollback', rollbackCommand, options);
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
 * @summary Construire groupes et palettes
 * @description Prepare groupes, palettes et submasters sur des numeros libres. Preview complete, valeurs explicites, arret au premier echec et relecture des champs OSC disponibles.
 * @arguments Voir docs/tools.md#eos-workflow-build-groups-and-palettes pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-build-groups-and-palettes pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-build-groups-and-palettes pour un exemple OSC.
 */
export const eosWorkflowBuildGroupsAndPalettesTool: ToolDefinition<typeof buildGroupsAndPalettesInputSchema> = {
  name: 'eos_workflow_build_groups_and_palettes',
  config: {
    title: 'Construire groupes et palettes',
    description: 'Prepare groupes, palettes et submasters sur des numeros libres. Preview complete, valeurs explicites, arret au premier echec et relecture des champs OSC disponibles.',
    annotations: primaryWorkflowAnnotations,
    inputSchema: buildGroupsAndPalettesInputSchema
  },
  handler: async (args) => {
    return prepareShowObjects(args, 'eos_workflow_build_groups_and_palettes');
  }
};

/**
 * @tool eos_workflow_update_cue_look
 * @summary Mettre a jour le look d une cue
 * @description Rappelle une cue explicite, applique une intensite absolue aux canaux puis Update. Modifie la sortie live; les valeurs enregistrees restent a verifier dans Eos.
 * @arguments Voir docs/tools.md#eos-workflow-update-cue-look pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-update-cue-look pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-update-cue-look pour un exemple OSC.
 */
export const eosWorkflowUpdateCueLookTool: ToolDefinition<typeof updateCueLookInputSchema> = {
  name: 'eos_workflow_update_cue_look',
  config: {
    title: 'Mettre a jour le look d une cue',
    description: 'Rappelle une cue explicite, applique une intensite absolue aux canaux puis Update. Modifie la sortie live; les valeurs enregistrees restent a verifier dans Eos.',
    annotations: primaryWorkflowAnnotations,
    inputSchema: updateCueLookInputSchema
  },
  handler: async (args) => {
    const options = workflowObject(updateCueLookInputSchema).parse(args ?? {});

    if (options.desaturate || options.warmify || options.intensity_factor != null) {
      throw new Error('Transformation relative ou artistique indisponible: fournir une intensite absolue explicite. Aucune commande envoyee.');
    }
    const dryRun = options.dry_run === true;
    const blockUnconfirmedExecution = shouldBlockUnconfirmedExecution(options);
    const steps: WorkflowStepLog[] = [];
    const partialErrors: Array<{ step: string; error: string }> = [];
    const commandsPreview: string[] = [];

    if (options.cue_number != null && options.cuelist_number == null) {
      pushDefaultLog(steps, 'default_cuelist_number', 'cuelist_number absent: utilisation automatique de la cuelist master pour la cue cible.');
    }

    if (options.cue_number == null) {
      pushDefaultLog(steps, 'default_cue_number', 'cue_number absent: modification appliquee a la cue courante via Update Cue.');
    }
    const updateTarget = `Update ${formatCueTarget(options.cue_number, options.cuelist_number)}`;
    const commands = [
      {step:'go_to_cue', command:`Go To ${formatCueTarget(options.cue_number,options.cuelist_number)}`},
      {step:'set_intensity', command:`Chan ${options.channels} At ${options.intensity}`},
      {step:'update_cue', command:updateTarget}
    ];
    if (!dryRun && !blockUnconfirmedExecution) {
      const existing = await readCue(options.cue_number,options.cuelist_number,options);
      if (existing.status !== 'ok') throw new Error('La cue cible doit etre presente et lisible avant sa modification.');
    }

    for (const commandStep of commands) {
      commandsPreview.push(commandStep.command);
      if (dryRun || blockUnconfirmedExecution) {
        steps.push({ step: commandStep.step, status: 'skipped', command: commandStep.command, detail: previewSkipDetail(dryRun) });
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

    if (blockUnconfirmedExecution) {
      return buildUnconfirmedExecutionResult('eos_workflow_update_cue_look', steps, partialErrors, commandsPreview);
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
  eosWorkflowCreateCueSeriesTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowPatchScanTool,
  eosWorkflowAutopatchBandTool,
  eosWorkflowRehearsalGoSafeTool,
  eosWorkflowBuildGroupsAndPalettesTool,
  eosWorkflowUpdateCueLookTool
] as ToolDefinition[];

export default workflowTools;
