/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { resolveFixture } from '../../fixtures';
import { sendDeterministicCommand } from '../commands/command_tools';

export interface PatchSequenceTargetOptions {
  user?: number;
  targetAddress?: string;
  targetPort?: number;
}

export interface PatchSequenceBuildOptions extends PatchSequenceTargetOptions {
  channel_number: number;
  dmx_address: string;
  label: string;
  device_type?: string;
  fixture_query?: string;
  fixture_manufacturer?: string;
  fixture_model?: string;
  fixture_name?: string;
  fixture_mode?: string;
  part?: number;
  position_x?: number;
  position_y?: number;
  position_z?: number;
}

export interface PatchSequenceCommandStep {
  step: 'patch_fixture' | 'label_fixture' | 'set_base_3d_position';
  command: string;
}

export interface PatchSequenceStepLog {
  step: string;
  status: 'ok' | 'error';
  command: string;
  error?: string;
}

export function extractPatchSequenceError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Erreur inconnue';
}

export function buildPatchSequence(options: PatchSequenceBuildOptions): {
  commands: PatchSequenceCommandStep[];
  fixtureResolution: ReturnType<typeof resolveFixture> | null;
} {
  const part = options.part ?? 1;
  let resolvedDeviceType = options.device_type;
  let fixtureResolution: ReturnType<typeof resolveFixture> | null = null;

  if (!resolvedDeviceType) {
    if (!options.fixture_query && !options.fixture_manufacturer && !options.fixture_model && !options.fixture_name) {
      throw new Error('device_type ou une recherche fixture_* est requis.');
    }

    fixtureResolution = resolveFixture({
      fixtureQuery: options.fixture_query,
      fixtureManufacturer: options.fixture_manufacturer,
      fixtureModel: options.fixture_model,
      fixtureName: options.fixture_name,
      fixtureMode: options.fixture_mode
    });
    resolvedDeviceType = fixtureResolution.deviceType;
  }

  return {
    commands: [
      {
        step: 'patch_fixture',
        command: `Patch Chan ${options.channel_number} Part ${part} Address ${options.dmx_address} Type "${resolvedDeviceType.replace(/"/g, '\\"')}"`
      },
      {
        step: 'label_fixture',
        command: `Chan ${options.channel_number} Part ${part} Label "${options.label.replace(/"/g, '\\"')}"`
      },
      {
        step: 'set_base_3d_position',
        command: `Chan ${options.channel_number} Part ${part} Position X ${options.position_x ?? 0} Y ${options.position_y ?? 0} Z ${options.position_z ?? 0}`
      }
    ],
    fixtureResolution
  };
}

export async function executePatchSequence(
  commands: PatchSequenceCommandStep[],
  options: PatchSequenceTargetOptions
): Promise<{ steps: PatchSequenceStepLog[]; partialErrors: Array<{ step: string; error: string }>; success: boolean }> {
  const steps: PatchSequenceStepLog[] = [];
  const partialErrors: Array<{ step: string; error: string }> = [];

  for (const item of commands) {
    try {
      await sendDeterministicCommand({
        command: item.command,
        clearLine: true,
        terminateWithEnter: true,
        user: options.user,
        targetAddress: options.targetAddress,
        targetPort: options.targetPort,
        safety_level: 'off'
      });
      steps.push({ step: item.step, status: 'ok', command: item.command });
    } catch (error) {
      const message = extractPatchSequenceError(error);
      steps.push({ step: item.step, status: 'error', command: item.command, error: message });
      partialErrors.push({ step: item.step, error: message });
      return { steps, partialErrors, success: false };
    }
  }

  return { steps, partialErrors, success: true };
}
