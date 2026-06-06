/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolDefinition, ToolMetadata, ToolRiskLevel } from '../types';
import { resolveRiskLevelForSafetyProfile, type ToolSafetyProfile } from './safety';

const DEFAULT_TOOL_ROLE: ToolSafetyProfile = 'read_only';

const EXACT_TOOL_ROLES: Readonly<Record<string, ToolSafetyProfile>> = {
  eos_command: 'admin',
  eos_new_command: 'admin',
  eos_command_with_substitution: 'admin',
  eos_cue_record: 'admin',
  eos_cue_update: 'admin',
  eos_cue_label_set: 'admin',
  eos_cue_fire: 'live_playback',
  eos_cue_go: 'live_playback',
  eos_cue_stop_back: 'live_playback',
  eos_patch_set_channel: 'admin',
  eos_macro_fire: 'admin',
  eos_macro_select: 'admin',
  eos_snapshot_recall: 'admin',
  eos_connect: 'read_only',
  eos_configure: 'read_only',
  eos_reset: 'admin',
  eos_showfile_import: 'admin',
  eos_set_cue_receive_string: 'admin',
  eos_set_cue_send_string: 'admin'
};

const ROLE_PATTERNS: Array<{ pattern: RegExp; role: ToolSafetyProfile }> = [
  { pattern: /^eos_workflow_/, role: 'admin' },
  { pattern: /^eos_patch_.*(?:set|write|update|record|delete)/, role: 'admin' },
  { pattern: /^eos_.*(?:record|update|delete|label_set)/, role: 'admin' },
  { pattern: /^eos_.*(?:fire|go|stop_back|bump|set_level|load|unload|press|tick|continuous)/, role: 'live_playback' },
  { pattern: /^eos_(?:channel|group|address|set_|palette|preset|effect|direct_select|fader|submaster)/, role: 'programming' }
];

const READ_ONLY_TOOL_PATTERNS = [
  /^eos_.*(?:get|list|info|labels|name|state|active|pending|capabilities|ping)/,
  /^eos_patch_get_/,
  /^eos_get_/,
  /^eos_readiness_check$/
];

export function resolveToolRequiredRole(tool: Pick<ToolDefinition, 'name' | 'metadata'>): ToolSafetyProfile {
  const metadataRole = tool.metadata?.requiredRole;
  if (metadataRole) {
    return metadataRole;
  }

  const exactRole = EXACT_TOOL_ROLES[tool.name];
  if (exactRole) {
    return exactRole;
  }

  if (READ_ONLY_TOOL_PATTERNS.some((pattern) => pattern.test(tool.name))) {
    return 'read_only';
  }

  const matched = ROLE_PATTERNS.find(({ pattern }) => pattern.test(tool.name));
  return matched?.role ?? DEFAULT_TOOL_ROLE;
}

export function classifyToolMetadata(tool: ToolDefinition): Required<Pick<ToolMetadata, 'readOnly' | 'riskLevel' | 'requiresConfirmation' | 'requiredRole'>> {
  const requiredRole = resolveToolRequiredRole(tool);
  const readOnly = tool.metadata?.readOnly ?? requiredRole === 'read_only';
  const existingRiskLevel = tool.metadata?.riskLevel;
  const riskLevel: ToolRiskLevel = existingRiskLevel ?? resolveRiskLevelForSafetyProfile(requiredRole, {
    critical: existingRiskLevel === 'critical'
  });
  const requiresConfirmation = tool.metadata?.requiresConfirmation ?? !readOnly;

  return {
    readOnly,
    riskLevel,
    requiresConfirmation,
    requiredRole
  };
}
