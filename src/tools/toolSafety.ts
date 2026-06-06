/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolDefinition, ToolMetadata, ToolRiskLevel } from './types';
import { getOscAddressOfficiality } from '../services/osc/officiality';
import { type ToolSafetyProfile } from './common/safety';

export interface ToolSafetyClassification {
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  allowedInReadOnly: boolean;
  allowedInStrictMode: boolean;
  defaultDryRun: boolean;
  readOnly: boolean;
  requiredRole: ToolSafetyProfile;
}

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

const DANGEROUS_EXACT_TOOLS = new Set([
  'eos_command',
  'eos_new_command',
  'eos_command_with_substitution',
  'eos_reset',
  'eos_showfile_import',
  'eos_patch_set_channel',
  'eos_set_cue_receive_string',
  'eos_set_cue_send_string'
]);

const SHOW_MODIFYING_PATTERNS = [
  /^eos_workflow_/,
  /^eos_patch_/,
  /^eos_.*(?:record|update|delete|label_set)/,
  /^eos_(?:channel|group|address|set_|palette|preset|effect|direct_select|submaster)/
];

const LIVE_PATTERNS = [
  /^eos_.*(?:fire|go|stop_back|bump|set_level|load|unload|press|tick|continuous)/,
  /^eos_fader_/
];

function collectOscAddresses(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectOscAddresses(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectOscAddresses(entry));
  }
  return [];
}

function resolveAllowedInStrictMode(tool: ToolDefinition): boolean {
  const metadataValue = tool.metadata?.allowedInStrictMode;
  if (typeof metadataValue === 'boolean') {
    return metadataValue;
  }

  const mapping = tool.config.annotations?.mapping as { osc?: unknown } | undefined;
  const addresses = collectOscAddresses(mapping?.osc);
  return addresses.every((address) => getOscAddressOfficiality(address)?.strictModeAllowed === true);
}

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

function resolveRiskLevel(tool: ToolDefinition, readOnly: boolean, requiredRole: ToolSafetyProfile): ToolRiskLevel {
  if (!tool.name.startsWith('eos_') && tool.metadata?.riskLevel) {
    return tool.metadata.riskLevel;
  }

  if (readOnly) {
    return 'read';
  }

  if (DANGEROUS_EXACT_TOOLS.has(tool.name)) {
    return 'dangerous';
  }

  if (requiredRole === 'live_playback' || LIVE_PATTERNS.some((pattern) => pattern.test(tool.name))) {
    return 'live';
  }

  if (requiredRole === 'programming' || requiredRole === 'admin' || SHOW_MODIFYING_PATTERNS.some((pattern) => pattern.test(tool.name))) {
    return 'show-modifying';
  }

  return 'preview';
}

export function classifyToolSafety(tool: ToolDefinition): ToolSafetyClassification {
  const requiredRole = resolveToolRequiredRole(tool);
  const readOnly = tool.metadata?.readOnly ?? requiredRole === 'read_only';
  const riskLevel = resolveRiskLevel(tool, readOnly, requiredRole);
  const requiresConfirmation = tool.metadata?.requiresConfirmation ?? (!['read', 'preview'].includes(riskLevel));
  const allowedInReadOnly = tool.metadata?.allowedInReadOnly ?? (readOnly || riskLevel === 'preview');
  const allowedInStrictMode = resolveAllowedInStrictMode(tool);
  const defaultDryRun = tool.metadata?.defaultDryRun ?? ['live', 'show-modifying', 'dangerous'].includes(riskLevel);

  return {
    riskLevel,
    requiresConfirmation,
    allowedInReadOnly,
    allowedInStrictMode,
    defaultDryRun,
    readOnly,
    requiredRole
  };
}

export function classifyToolMetadata(tool: ToolDefinition): Required<Pick<ToolMetadata,
  'readOnly' |
  'riskLevel' |
  'requiresConfirmation' |
  'requiredRole' |
  'allowedInReadOnly' |
  'allowedInStrictMode' |
  'defaultDryRun'
>> {
  return classifyToolSafety(tool);
}
