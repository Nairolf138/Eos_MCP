/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { buildToolResult, type ToolDefinition } from '../types';
import { readPatchChannelInfo, type PatchChannelInfo } from '../patch/index';

const channelNumberSchema = z.coerce.number().int().min(1).max(99999);
const timeoutSchema = z.coerce.number().int().min(50).optional();
const partModeSchema = z.enum(['all', 'part_1']).optional().default('all');

const patchScanInputSchema = {
  start_channel: channelNumberSchema.optional(),
  end_channel: channelNumberSchema.optional(),
  channels: z.array(channelNumberSchema).min(1).max(1000).optional(),
  part_mode: partModeSchema,
  timeoutMs: timeoutSchema,
  max_concurrency: z.coerce.number().int().min(1).max(5).optional().default(2),
  rate_limit_ms: z.coerce.number().int().min(0).max(5000).optional().default(100),
  continue_on_error: z.boolean().optional().default(true),
  failure_rate_threshold: z.coerce.number().min(0).max(1).optional().default(0.5),
  dry_run: z.boolean().optional().default(false),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

interface PatchScanItem {
  status: string;
  channel: PatchChannelInfo | { channel_number: number };
  error: string | null;
  diagnostics: unknown | null;
  source: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function uniqueSortedChannels(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function resolveChannels(options: z.infer<z.ZodObject<typeof patchScanInputSchema>>): number[] {
  if (options.channels != null) {
    return uniqueSortedChannels(options.channels);
  }

  if (options.start_channel == null || options.end_channel == null) {
    throw new Error('channels ou start_channel + end_channel sont requis.');
  }

  if (options.end_channel < options.start_channel) {
    throw new Error('end_channel doit etre superieur ou egal a start_channel.');
  }

  const channels: number[] = [];
  for (let channel = options.start_channel; channel <= options.end_channel; channel += 1) {
    channels.push(channel);
  }
  return channels;
}

function partNumberFromMode(partMode: z.infer<typeof partModeSchema>): number {
  return partMode === 'part_1' ? 1 : 0;
}

function shouldAbort(processed: number, failures: number, threshold: number): boolean {
  return processed > 0 && failures / processed > threshold;
}

/**
 * @tool eos_workflow_patch_scan
 * @summary Scanner le patch de plusieurs canaux
 * @description Lit les informations de patch canal par canal avec concurrence basse, pause entre requetes et arret de securite sur taux d echec configurable.
 * @arguments Voir docs/tools.md#eos-workflow-patch-scan pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-workflow-patch-scan pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-workflow-patch-scan pour un exemple OSC.
 */
export const eosWorkflowPatchScanTool: ToolDefinition<typeof patchScanInputSchema> = {
  name: 'eos_workflow_patch_scan',
  config: {
    title: 'Scanner le patch de plusieurs canaux',
    description: 'Lit les informations de patch canal par canal avec concurrence basse, pause entre requetes et arret de securite sur taux d echec configurable.',
    inputSchema: patchScanInputSchema
  },
  handler: async (args) => {
    const schema = z.object(patchScanInputSchema).passthrough();
    const options = schema.parse(args ?? {});
    const requestedChannels = resolveChannels(options);
    const partNumber = partNumberFromMode(options.part_mode);
    const results: PatchScanItem[] = [];
    const errors: Array<{ channel_number: number; error: string }> = [];
    let nextIndex = 0;
    let processed = 0;
    let failures = 0;
    let aborted = false;
    let abortReason: string | null = null;
    let nextAllowedAt = 0;

    const takeNext = (): number | null => {
      if (aborted || nextIndex >= requestedChannels.length) {
        return null;
      }
      const channel = requestedChannels[nextIndex];
      nextIndex += 1;
      return channel;
    };

    const waitForRateLimit = async (): Promise<void> => {
      const now = Date.now();
      const waitMs = Math.max(0, nextAllowedAt - now);
      nextAllowedAt = Math.max(now, nextAllowedAt) + options.rate_limit_ms;
      await sleep(waitMs);
    };

    if (options.dry_run) {
      for (const channelNumber of requestedChannels) {
        results.push({
          status: 'skipped',
          channel: { channel_number: channelNumber },
          error: null,
          diagnostics: null,
          source: {
            type: 'dry_run',
            action: 'eos_patch_get_channel_info',
            args: { channel: channelNumber, part: partNumber }
          }
        });
      }

      return buildToolResult({
        text: `Dry run patch scan genere pour ${requestedChannels.length} canal(aux).`,
        structuredContent: {
          workflow: 'eos_workflow_patch_scan',
          status: 'ok',
          steps: results.map((entry) => ({ step: `scan_channel_${entry.channel.channel_number}`, status: entry.status, detail: 'dry_run' })),
          executedSteps: results.map((entry) => ({ step: `scan_channel_${entry.channel.channel_number}`, status: entry.status, detail: 'dry_run' })),
          applied_defaults: [],
          warnings: [],
          results,
          channels: requestedChannels,
          scan: {
            requested: requestedChannels.length,
            processed: 0,
            failures: 0,
            aborted: false,
            max_concurrency: options.max_concurrency,
            rate_limit_ms: options.rate_limit_ms,
            failure_rate_threshold: options.failure_rate_threshold,
            part_mode: options.part_mode
          },
          commands_preview: requestedChannels.map((channelNumber) => `eos_patch_get_channel_info channel=${channelNumber} part=${partNumber}`)
        }
      });
    }

    const worker = async (): Promise<void> => {
      while (true) {
        const channelNumber = takeNext();
        if (channelNumber == null) {
          return;
        }

        await waitForRateLimit();

        try {
          const info = await readPatchChannelInfo({
            channel_number: channelNumber,
            part_number: partNumber,
            timeoutMs: options.timeoutMs,
            targetAddress: options.targetAddress,
            targetPort: options.targetPort
          });
          const ok = info.status === 'ok';
          if (!ok) {
            failures += 1;
            errors.push({ channel_number: channelNumber, error: info.error ?? `status=${info.status}` });
          }
          results.push({
            status: info.status,
            channel: info.channel,
            error: info.error ?? null,
            diagnostics: info.diagnostics ?? null,
            source: { type: 'osc', ...info.osc }
          });
        } catch (error) {
          failures += 1;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ channel_number: channelNumber, error: message });
          results.push({
            status: 'error',
            channel: { channel_number: channelNumber },
            error: message,
            diagnostics: null,
            source: { type: 'exception', action: 'eos_patch_get_channel_info', args: { channel: channelNumber, part: partNumber } }
          });
        } finally {
          processed += 1;
          if (!options.continue_on_error && failures > 0) {
            aborted = true;
            abortReason = 'continue_on_error=false';
          } else if (shouldAbort(processed, failures, options.failure_rate_threshold)) {
            aborted = true;
            abortReason = `failure_rate_threshold depasse (${failures}/${processed} > ${options.failure_rate_threshold})`;
          }
        }
      }
    };

    const concurrency = Math.min(options.max_concurrency, requestedChannels.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    results.sort((left, right) => (left.channel.channel_number ?? 0) - (right.channel.channel_number ?? 0));

    const status = aborted ? 'partial_failure' : failures > 0 ? 'partial_failure' : 'ok';
    return buildToolResult({
      text: aborted
        ? `Patch scan interrompu apres ${processed}/${requestedChannels.length} canal(aux): ${abortReason}.`
        : `Patch scan termine pour ${processed}/${requestedChannels.length} canal(aux).`,
      structuredContent: {
        workflow: 'eos_workflow_patch_scan',
        status,
        steps: results.map((entry) => ({
          step: `scan_channel_${entry.channel.channel_number}`,
          status: entry.status === 'ok' ? 'ok' : 'error',
          ...(entry.error ? { error: entry.error } : {})
        })),
        executedSteps: results.map((entry) => ({
          step: `scan_channel_${entry.channel.channel_number}`,
          status: entry.status === 'ok' ? 'ok' : 'error',
          ...(entry.error ? { error: entry.error } : {})
        })),
        applied_defaults: [],
        warnings: errors.map((entry) => ({ step: `scan_channel_${entry.channel_number}`, detail: entry.error })),
        results,
        channels: requestedChannels,
        errors,
        scan: {
          requested: requestedChannels.length,
          processed,
          failures,
          failure_rate: processed > 0 ? failures / processed : 0,
          aborted,
          abort_reason: abortReason,
          max_concurrency: options.max_concurrency,
          rate_limit_ms: options.rate_limit_ms,
          failure_rate_threshold: options.failure_rate_threshold,
          part_mode: options.part_mode
        }
      }
    });
  }
};

export default eosWorkflowPatchScanTool;
