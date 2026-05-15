/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { toolSafetyProfileSchema, type ToolSafetyProfile } from '../tools/common/safety';

let hasInitialised = false;

export function initialiseEnv(): void {
  if (hasInitialised) {
    return;
  }

  config({ path: resolve(process.cwd(), '.env') });
  hasInitialised = true;
}


const DEFAULT_ALLOWED_TOOL_PROFILE: ToolSafetyProfile = 'read_only';

export const DEFAULT_ALLOWED_TOOL_PROFILE_ENV = 'EOS_MCP_ALLOWED_TOOL_PROFILE';

export function getDefaultAllowedToolProfile(
  env: NodeJS.ProcessEnv = process.env
): ToolSafetyProfile {
  const raw = env[DEFAULT_ALLOWED_TOOL_PROFILE_ENV] ?? env.MCP_ALLOWED_TOOL_PROFILE;
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return DEFAULT_ALLOWED_TOOL_PROFILE;
  }

  const parsed = toolSafetyProfileSchema.safeParse(raw.trim());
  if (!parsed.success) {
    throw new Error(
      `Configuration invalide: ${DEFAULT_ALLOWED_TOOL_PROFILE_ENV} doit valoir ${toolSafetyProfileSchema.options.join(', ')}.`
    );
  }

  return parsed.data;
}
