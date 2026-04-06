/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */

export type EosNodeRole = 'Primary' | 'Backup' | 'Unknown';

export interface CompatibilityContext {
  eosVersion: string | null;
  role: EosNodeRole;
}

export interface CompatibilityRule {
  id: string;
  minEosVersion: string | null;
  requiredRole: 'Primary' | 'Backup' | 'Any';
  functionalAvailability: 'available' | 'limited' | 'unavailable';
  notes?: string;
}

interface RuleEntry {
  matches: (toolName: string) => boolean;
  rule: CompatibilityRule;
}

export interface CompatibilityStatus {
  tool: string;
  compatible: boolean;
  reasons: string[];
  requirements: CompatibilityRule;
  context: CompatibilityContext;
}

const BASELINE_RULE: CompatibilityRule = {
  id: 'baseline-eos-osc-tools',
  minEosVersion: '3.0.0',
  requiredRole: 'Any',
  functionalAvailability: 'available',
  notes: 'Compatibilite par defaut pour les outils OSC eos_*.'
};

const COMPATIBILITY_RULES: RuleEntry[] = [
  {
    matches: (toolName) => toolName === 'eos_magic_sheet_send_string',
    rule: {
      id: 'magic-sheet-send-string-primary-only',
      minEosVersion: '3.2.0',
      requiredRole: 'Primary',
      functionalAvailability: 'available',
      notes: 'Necessite un noeud Primary pour pouvoir injecter du texte.'
    }
  },
  {
    matches: (toolName) => toolName.startsWith('eos_connect') || toolName.startsWith('eos_configure') || toolName.startsWith('eos_ping') || toolName.startsWith('eos_reset') || toolName.startsWith('eos_subscribe'),
    rule: {
      id: 'connection-tools-bootstrap',
      minEosVersion: null,
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Outils de connexion utilisables meme avant detection de version EOS.'
    }
  },
  {
    matches: (toolName) => toolName === 'eos_capabilities_get',
    rule: {
      id: 'capabilities-meta-tool',
      minEosVersion: null,
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Outil meta; ne doit jamais etre bloque par la matrice.'
    }
  }
];

function parseVersion(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) {
    return null;
  }

  const parsed = cleaned
    .split('.')
    .map((segment) => Number.parseInt(segment.replace(/[^0-9].*$/, ''), 10));

  if (parsed.some((segment) => Number.isNaN(segment))) {
    return null;
  }

  return [parsed[0] ?? 0, parsed[1] ?? 0, parsed[2] ?? 0];
}

function compareVersions(left: string, right: string): number | null {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);

  if (!leftParsed || !rightParsed) {
    return null;
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParsed[index]! > rightParsed[index]!) {
      return 1;
    }
    if (leftParsed[index]! < rightParsed[index]!) {
      return -1;
    }
  }

  return 0;
}

function isOscTool(toolName: string): boolean {
  return toolName.startsWith('eos_');
}

function resolveRule(toolName: string): CompatibilityRule {
  const matching = COMPATIBILITY_RULES.find((entry) => entry.matches(toolName));
  if (matching) {
    return matching.rule;
  }

  if (isOscTool(toolName)) {
    return BASELINE_RULE;
  }

  return {
    id: 'non-osc-tool',
    minEosVersion: null,
    requiredRole: 'Any',
    functionalAvailability: 'available',
    notes: 'Outil non OSC: pas de contrainte de compatibilite EOS.'
  };
}

export function evaluateToolCompatibility(toolName: string, context: CompatibilityContext): CompatibilityStatus {
  const requirements = resolveRule(toolName);
  const reasons: string[] = [];

  if (requirements.functionalAvailability === 'unavailable') {
    reasons.push('Fonctionnalite marquee comme indisponible dans la matrice.');
  }

  if (requirements.requiredRole !== 'Any' && context.role !== 'Unknown' && context.role !== requirements.requiredRole) {
    reasons.push(`Role requis: ${requirements.requiredRole}, role detecte: ${context.role}.`);
  }

  if (requirements.requiredRole !== 'Any' && context.role === 'Unknown') {
    reasons.push(`Role requis: ${requirements.requiredRole}, role detecte: inconnu.`);
  }

  if (requirements.minEosVersion && context.eosVersion) {
    const comparison = compareVersions(context.eosVersion, requirements.minEosVersion);
    if (comparison === null) {
      reasons.push(`Version EOS non interpretable (${context.eosVersion}). Minimum requis: ${requirements.minEosVersion}.`);
    } else if (comparison < 0) {
      reasons.push(`Version EOS detectee ${context.eosVersion} inferieure au minimum ${requirements.minEosVersion}.`);
    }
  }

  return {
    tool: toolName,
    compatible: reasons.length === 0,
    reasons,
    requirements,
    context
  };
}

export function getCompatibilityRulesForTools(toolNames: string[]): Array<{ tool: string; rule: CompatibilityRule }> {
  return toolNames
    .map((tool) => ({ tool, rule: resolveRule(tool) }))
    .sort((left, right) => left.tool.localeCompare(right.tool));
}

function parseRole(raw: unknown): EosNodeRole {
  if (typeof raw !== 'string') {
    return 'Unknown';
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'primary') {
    return 'Primary';
  }
  if (normalized === 'backup' || normalized === 'secondary') {
    return 'Backup';
  }

  return 'Unknown';
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function resolveCompatibilityContext(args: unknown, extra: unknown): CompatibilityContext {
  const argRecord = asObject(args);
  const extraRecord = asObject(extra);

  const argConnection = asObject(argRecord.connection);
  const extraConnection = asObject(extraRecord.connection);

  const eosVersionCandidate =
    argRecord.eosVersion ??
    argRecord.eos_version ??
    extraRecord.eosVersion ??
    extraRecord.eos_version ??
    argConnection.eosVersion ??
    argConnection.eos_version ??
    extraConnection.eosVersion ??
    extraConnection.eos_version;

  const roleCandidate =
    argRecord.role ??
    argRecord.connectionRole ??
    argRecord.connection_role ??
    extraRecord.role ??
    extraRecord.connectionRole ??
    extraRecord.connection_role ??
    argConnection.role ??
    extraConnection.role;

  return {
    eosVersion: typeof eosVersionCandidate === 'string' && eosVersionCandidate.trim().length > 0
      ? eosVersionCandidate.trim()
      : null,
    role: parseRole(roleCandidate)
  };
}
