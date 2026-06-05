/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { getOscClient, type CommandLineState, type OscRuntimeCapabilities } from '../../services/osc/client';
import { buildCueJsonMessage } from '../../services/osc/messageBuilders';
import { oscMappings } from '../../services/osc/mappings';
import { getCurrentUserId } from '../session/index';
import {
  assertSensitiveActionAllowed,
  createDryRunResult,
  isSensitiveCommandText,
  resolveSafetyOptions,
  safetyOptionsSchema,
  type SafetyOptions
} from '../common/safety';
import { buildToolResult, withToolMetadata, type ToolDefinition, type ToolExecutionResult } from '../types';
import { buildCueCommandPayload, createCueIdentifierFromOptions, formatCueDescription } from '../cues/common';
import { mapCueList } from '../cues/mappers';
import type { CueIdentifier } from '../cues/types';
import eosV3CommandProfile from './commandProfiles/eos-v3.json';

type SubstitutionValue = string | number | boolean;

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  ...safetyOptionsSchema,
  verify_after_send: z.boolean().optional(),
  verification_timeout_ms: z.coerce.number().int().positive().max(10000).optional()
};

const substitutionsSchema = z.array(z.union([z.string(), z.number(), z.boolean()])).optional();

const mappingAnnotations = (osc: string, cli: string): Record<string, unknown> => ({
  mapping: {
    osc,
    cli
  }
});

const cueProgrammingGuardrails = {
  workflow: [
    'Programmer les cues en sequence explicite: selection, parametrage, record, label.',
    'Preferer eos_new_command avec clearLine=true pour eviter les restes de saisie.',
    'Activer terminateWithEnter=true pour valider sans concatenation ambigue de #.',
    'Ne pas utiliser ces commandes pour patch/etats live/palettes si un outil dedie existe.'
  ],
  manual: ['manual://eos#command-line', 'manual://eos#cue-timing', 'manual://eos#cue-playback']
};

type SafetyLevel = 'strict' | 'standard' | 'off';
type CommandDomain = 'cue' | 'patch' | 'palette' | 'playback';

interface CommandRuleProfile {
  id: string;
  pattern: string;
  description: string;
  example: string;
}

interface CommandDomainProfile {
  description: string;
  rules: CommandRuleProfile[];
}

interface CommandProfile {
  version: string;
  syntax: {
    allowedCharsPattern: string;
    ruleId: string;
    description: string;
  };
  securityLevels: Record<'strict' | 'standard', { allowedDomains: CommandDomain[]; description: string }>;
  domains: Record<CommandDomain, CommandDomainProfile>;
}

interface CompiledCommandRule {
  id: string;
  domain: CommandDomain;
  regex: RegExp;
  description: string;
  example: string;
}

const commandProfile = eosV3CommandProfile as CommandProfile;
const syntaxAllowedCharsRegex = new RegExp(commandProfile.syntax.allowedCharsPattern, 'i');

const compiledRules: CompiledCommandRule[] = (Object.entries(commandProfile.domains) as Array<[CommandDomain, CommandDomainProfile]>)
  .flatMap(([domain, domainProfile]) =>
    domainProfile.rules.map((rule) => ({
      id: rule.id,
      domain,
      regex: new RegExp(rule.pattern, 'i'),
      description: rule.description,
      example: rule.example
    }))
  );

function normalizeCommandForValidation(command: string): string {
  return command.replace(/#\s*$/, '').trim();
}

const composedCueProgrammingSequence = 'Chan 1 Thru 10 At Full puis Record Cue 3 puis Cue 3 Label "Reggae"';

function stripQuotedText(command: string): string {
  return command.replace(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g, ' ');
}

function commandContainsWord(command: string, word: string): boolean {
  return new RegExp(`(^|\\s)${word}(\\s|$)`, 'i').test(command);
}

function assertNoComposedCueProgrammingCommand(command: string): void {
  const normalized = stripQuotedText(normalizeCommandForValidation(command)).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return;
  }

  const hasAt = commandContainsWord(normalized, 'at');
  const hasRecord = commandContainsWord(normalized, 'record');
  const hasUpdate = commandContainsWord(normalized, 'update');
  const hasDelete = commandContainsWord(normalized, 'delete');
  const hasLabel = commandContainsWord(normalized, 'label');
  const violations: string[] = [];

  if (hasRecord && hasLabel) {
    violations.push('Record + Label');
  }
  if (hasAt && hasRecord) {
    violations.push('At + Record');
  }
  if (hasUpdate && hasLabel) {
    violations.push('Update + Label');
  }
  if (hasDelete && (hasAt || hasRecord || hasUpdate || hasLabel)) {
    violations.push('Delete + autre action');
  }

  if (violations.length > 0) {
    throw new Error(
      `Commande composee de programmation de cues refusee (${violations.join(', ')}). ` +
        `Envoyez une action sensible par ligne. Sequence correcte: ${composedCueProgrammingSequence}.`
    );
  }
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_value, col) => (row === 0 ? col : col === 0 ? row : 0))
  );

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function closestAllowedRule(command: string, allowedDomains: CommandDomain[]): CompiledCommandRule | null {
  const normalizedCommand = command.toLowerCase();
  const candidateRules = compiledRules.filter((rule) => allowedDomains.includes(rule.domain));
  if (!candidateRules.length) {
    return null;
  }

  return candidateRules.reduce<CompiledCommandRule | null>((best, current) => {
    if (!best) {
      return current;
    }
    const bestDistance = levenshteinDistance(normalizedCommand, best.example.toLowerCase());
    const currentDistance = levenshteinDistance(normalizedCommand, current.example.toLowerCase());
    return currentDistance < bestDistance ? current : best;
  }, null);
}

function assertCommandSyntaxAllowed(command: string, safetyLevel: SafetyLevel): void {
  if (safetyLevel === 'off') {
    return;
  }

  const normalized = normalizeCommandForValidation(command);
  if (!normalized || !syntaxAllowedCharsRegex.test(normalized)) {
    throw new Error(
      `Validation profile ${commandProfile.version} - regle violee ${commandProfile.syntax.ruleId}: ${commandProfile.syntax.description}.`
    );
  }

  const allowedDomains = commandProfile.securityLevels[safetyLevel].allowedDomains;
  const matchedRule = compiledRules.find((rule) => allowedDomains.includes(rule.domain) && rule.regex.test(normalized));
  if (!matchedRule) {
    const closestRule = closestAllowedRule(normalized, allowedDomains);
    const closestMessage = closestRule
      ? `Commande autorisee la plus proche: "${closestRule.example}" (regle ${closestRule.id}, domaine ${closestRule.domain}).`
      : 'Aucune commande autorisee disponible pour ce niveau.';
    throw new Error(
      `Validation profile ${commandProfile.version} - regle violee security.${safetyLevel}.allowlist: commande "${normalized}" non autorisee pour domaines [${allowedDomains.join(', ')}]. ${closestMessage}`
    );
  }
}

export function ensureTerminator(command: string, terminate?: boolean): string {
  if (!terminate) {
    return command;
  }

  const normalizedCommand = command.trimEnd();
  return /(?:#|\bEnter)$/i.test(normalizedCommand) ? normalizedCommand : `${normalizedCommand}#`;
}

function applySubstitutions(template: string, values: SubstitutionValue[] = []): string {
  const normalisedValues = values.map((value) => String(value));
  return template.replace(/%(%|\d+)/g, (match, group) => {
    if (group === '%') {
      return '%';
    }

    const index = Number.parseInt(group, 10);
    if (Number.isNaN(index) || index < 1) {
      return '';
    }

    const replacement = normalisedValues[index - 1];
    return replacement ?? '';
  });
}

function buildOscDescriptor(command: string, user?: number | null): Record<string, unknown> {
  const args: Array<{ type: string; value: string | number }> = [{ type: 's', value: command }];
  if (typeof user === 'number' && Number.isFinite(user)) {
    args.push({ type: 'i', value: Math.trunc(user) });
  }
  return { args };
}

interface CommandVerificationResult {
  status: 'verified' | 'not_verified' | 'skipped';
  accepted_by_eos: boolean | null;
  verified: boolean;
  method: string | null;
  warning?: string;
  warnings?: string[];
  next_actions?: string[];
  details?: unknown;
}

const unverifiedWarning = 'commande envoyée mais non vérifiée dans EOS';
const sensitiveUnverifiedWarning =
  'COMMANDE SENSIBLE ENVOYEE MAIS NON VERIFIEE DANS EOS: ne pas enchainer d operation destructive avant relecture explicite.';
const manualRereadNextAction =
  'Effectuer une relecture manuelle de la console EOS ou relancer eos_readiness_check/eos_connect avant toute operation destructive.';
const confirmStateNextAction =
  'Confirmer explicitement l etat EOS attendu avec un operateur avant d enchainer record/update/delete/patch.';

function parseRecordCueIdentifier(command: string): CueIdentifier | null {
  const normalized = command.replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
  const match = /(?:^|\s)Record\s+Cue\s+(?:(\d+)\s*\/\s*)?([^\s]+)(?:\s+Part\s+(\d+))?/i.exec(normalized);
  if (!match) {
    return null;
  }

  return createCueIdentifierFromOptions({
    cuelist_number: match[1] != null ? Number(match[1]) : undefined,
    cue_number: match[2],
    cue_part: match[3] != null ? Number(match[3]) : undefined
  });
}

function cueIdentifiersMatch(actual: CueIdentifier, expected: CueIdentifier): boolean {
  const sameCue = actual.cueNumber != null && expected.cueNumber != null && String(actual.cueNumber) === String(expected.cueNumber);
  const sameList = expected.cuelistNumber == null || actual.cuelistNumber == null || actual.cuelistNumber === expected.cuelistNumber;
  const expectedPart = expected.cuePart ?? null;
  const actualPart = actual.cuePart ?? null;
  const samePart = expectedPart == null || expectedPart === actualPart;
  return sameCue && sameList && samePart;
}

async function verifyRecordedCue(
  command: string,
  options: { targetAddress?: string; targetPort?: number; timeoutMs?: number }
): Promise<CommandVerificationResult> {
  const identifier = parseRecordCueIdentifier(command);
  if (!identifier?.cueNumber) {
    return {
      status: 'not_verified',
      accepted_by_eos: null,
      verified: false,
      method: 'eos_cue_list_all',
      warning: unverifiedWarning,
      details: { reason: 'record_cue_target_not_parsed' }
    };
  }

  const client = getOscClient();
  const payload = buildCueCommandPayload({
    cuelistNumber: identifier.cuelistNumber,
    cueNumber: null,
    cuePart: null
  });
  const request = buildCueJsonMessage(oscMappings.cues.list, payload);
  const response = await client.requestBuiltJson(request, {
    targetAddress: options.targetAddress,
    targetPort: options.targetPort,
    timeoutMs: options.timeoutMs
  });
  const cues = response.status === 'ok' ? mapCueList(response.data, identifier) : [];
  const found = cues.some((cue) => cueIdentifiersMatch(cue.identifier, identifier));

  return {
    status: found ? 'verified' : 'not_verified',
    accepted_by_eos: response.status === 'ok' ? found : null,
    verified: found,
    method: 'eos_cue_list_all',
    ...(found ? {} : { warning: unverifiedWarning }),
    details: {
      status: response.status,
      identifier,
      cue_description: formatCueDescription(identifier),
      ...(response.error ? { error: response.error } : {})
    }
  };
}

async function verifyCommandLineAccepted(
  options: { user?: number; targetAddress?: string; targetPort?: number; timeoutMs?: number }
): Promise<CommandVerificationResult> {
  const result = await getOscClient().getCommandLine({
    user: options.user,
    targetAddress: options.targetAddress,
    targetPort: options.targetPort,
    timeoutMs: options.timeoutMs
  });

  return {
    status: result.status === 'ok' ? 'verified' : 'not_verified',
    accepted_by_eos: result.status === 'ok' ? true : null,
    verified: result.status === 'ok',
    method: 'eos_get_command_line',
    ...(result.status === 'ok' ? {} : { warning: unverifiedWarning }),
    details: result
  };
}

async function verifySensitiveCommandAfterSend(
  command: string,
  options: { user?: number; targetAddress?: string; targetPort?: number; timeoutMs?: number }
): Promise<CommandVerificationResult> {
  if (/\bRecord\s+Cue\b/i.test(command)) {
    return verifyRecordedCue(command, options);
  }
  return verifyCommandLineAccepted(options);
}

async function safelyVerifySensitiveCommandAfterSend(
  command: string,
  options: { user?: number; targetAddress?: string; targetPort?: number; timeoutMs?: number }
): Promise<CommandVerificationResult> {
  try {
    return await verifySensitiveCommandAfterSend(command, options);
  } catch (error) {
    return {
      status: 'not_verified',
      accepted_by_eos: null,
      verified: false,
      method: null,
      warning: unverifiedWarning,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }
}

function getRuntimeCapabilitiesSafe(): OscRuntimeCapabilities {
  const client = getOscClient() as { getRuntimeCapabilities?: () => OscRuntimeCapabilities };
  return client.getRuntimeCapabilities?.() ?? {
    canReadJsonQueries: false,
    readJsonQueriesStatus: 'read_capability_unconfirmed',
    reason: 'Client OSC de test ou legacy sans API de capacites de lecture JSON.'
  };
}

function buildSensitiveSkippedVerification(command: string, requestedVerifyAfterSend?: boolean): CommandVerificationResult {
  const capability = getRuntimeCapabilitiesSafe();
  const readUnavailable = !capability.canReadJsonQueries;
  const warning = requestedVerifyAfterSend === false
    ? `${sensitiveUnverifiedWarning} Verification desactivee explicitement par verify_after_send=false.`
    : `${sensitiveUnverifiedWarning} Lecture JSON EOS non disponible (${capability.readJsonQueriesStatus}).`;
  const nextActions = readUnavailable
    ? [manualRereadNextAction, confirmStateNextAction]
    : [confirmStateNextAction];

  return {
    status: 'skipped',
    accepted_by_eos: null,
    verified: false,
    method: null,
    warning,
    warnings: [warning],
    next_actions: nextActions,
    details: {
      reason: requestedVerifyAfterSend === false ? 'verify_after_send_disabled' : 'json_read_unavailable',
      command,
      runtime_capabilities: capability
    }
  };
}

async function resolveSensitiveCommandVerification(
  command: string,
  options: {
    user?: number;
    targetAddress?: string;
    targetPort?: number;
    timeoutMs?: number;
    verifyAfterSend?: boolean;
  }
): Promise<CommandVerificationResult | undefined> {
  if (!isSensitiveCommandText(command)) {
    return undefined;
  }

  const capability = getRuntimeCapabilitiesSafe();
  const shouldVerify = options.verifyAfterSend ?? capability.canReadJsonQueries;
  if (!shouldVerify) {
    return buildSensitiveSkippedVerification(command, options.verifyAfterSend);
  }

  return safelyVerifySensitiveCommandAfterSend(command, {
    user: options.user,
    targetAddress: options.targetAddress,
    targetPort: options.targetPort,
    timeoutMs: options.timeoutMs
  });
}

function formatSendResult(
  command: string,
  user: number | null,
  oscAddress: string,
  verification?: CommandVerificationResult
): ToolExecutionResult {
  const isPartialFailure = verification?.status === 'not_verified';
  const isSensitiveUnverified = verification?.status === 'not_verified' || verification?.status === 'skipped';
  const suffix = verification?.verified === true
    ? ' Verification EOS reussie.'
    : isSensitiveUnverified
      ? ` ${verification.warning ?? unverifiedWarning}.`
      : ' Acceptation EOS non verifiee.';

  const text = `Commande remise au transport OSC sur ${oscAddress}: ${command}.${suffix}`;
  return buildToolResult({
    text,
    status: isPartialFailure ? 'partial_failure' : 'ok',
    summary: text,
    commandsSent: [command],
    warnings: verification?.warnings?.length
      ? verification.warnings.map((warning) => ({ detail: warning }))
      : verification?.warning
        ? [{ detail: verification.warning }]
        : [],
    next_actions: verification?.next_actions ?? (verification?.status === 'not_verified' ? [manualRereadNextAction] : []),
    structuredContent: {
      command,
      user,
      sent_to_transport: true,
      accepted_by_eos: verification?.accepted_by_eos ?? null,
      verified: verification?.verified ?? false,
      ...(verification ? { verification } : {}),
      osc: {
        address: oscAddress,
        ...buildOscDescriptor(command, user)
      },
      cli: {
        text: command
      }
    }
  });
}

function formatCommandLineState(result: CommandLineState): ToolExecutionResult {
  const text = result.status === 'ok'
    ? `Ligne de commande utilisateur ${result.user ?? 'global'}: ${result.text}`
    : `Lecture de la ligne de commande indisponible (${result.status})`;
  return buildToolResult({
    text,
    status: result.status,
    summary: text,
    warnings: result.status === 'ok' ? [] : [text],
    structuredContent: { ...result }
  });
}

function resolveUserId(requested?: number | null): number | undefined {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested >= 0) {
    return Math.trunc(requested);
  }

  const stored = getCurrentUserId();
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
    return Math.trunc(stored);
  }

  return undefined;
}

export interface DeterministicCommandOptions extends SafetyOptions {
  command: string;
  terminateWithEnter?: boolean;
  clearLine?: boolean;
  user?: number;
  targetAddress?: string;
  targetPort?: number;
  dry_run?: boolean;
  verify_after_send?: boolean;
  verification_timeout_ms?: number;
}

export async function sendDeterministicCommand(options: DeterministicCommandOptions): Promise<ToolExecutionResult> {
  assertNoComposedCueProgrammingCommand(options.command);
  const client = getOscClient();
  const command = ensureTerminator(options.command, options.terminateWithEnter);
  const shouldClear = options.clearLine !== false;
  const user = resolveUserId(options.user);
  const safetyLevel = options.safety_level ?? 'off';
  assertCommandSyntaxAllowed(command, safetyLevel);

  if (options.dry_run) {
    return createDryRunResult({
      text: `Commande simulee: ${command}`,
      action: shouldClear ? 'new_command' : 'command',
      request: { command, clearLine: shouldClear, user: user ?? null },
      oscAddress: shouldClear ? oscMappings.commands.newCommand : oscMappings.commands.command,
      oscArgs: buildOscDescriptor(command, user ?? null).args,
      cli: { text: command }
    });
  }

  if (shouldClear) {
    await client.sendNewCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const verification = await resolveSensitiveCommandVerification(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      timeoutMs: options.verification_timeout_ms,
      verifyAfterSend: options.verify_after_send
    });
    return formatSendResult(command, user ?? null, oscMappings.commands.newCommand, verification);
  }

  await client.sendCommand(command, {
    user,
    targetAddress: options.targetAddress,
    targetPort: options.targetPort
  });

  const verification = await resolveSensitiveCommandVerification(command, {
    user,
    targetAddress: options.targetAddress,
    targetPort: options.targetPort,
    timeoutMs: options.verification_timeout_ms,
    verifyAfterSend: options.verify_after_send
  });

  return formatSendResult(command, user ?? null, oscMappings.commands.command, verification);
}

const commandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  terminateWithEnter: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_command
 * @summary Commande EOS
 * @description Envoie du texte sur la ligne de commande existante de la console. A n'utiliser que lorsqu'aucun outil dedie n'existe. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.
 * @arguments Voir docs/tools.md#eos-command pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-command pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-command pour un exemple OSC.
 */
export const eosCommandTool: ToolDefinition<typeof commandInputSchema> = {
  name: 'eos_command',
  config: {
    title: 'Commande EOS',
    description:
      "Envoie du texte sur la ligne de commande existante de la console. A n'utiliser que lorsqu'aucun outil dedie n'existe. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.",
    inputSchema: commandInputSchema,
    annotations: {
      ...mappingAnnotations(oscMappings.commands.command, 'command_line'),
      recommendedUsage: cueProgrammingGuardrails
    }
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const command = ensureTerminator(options.command, options.terminateWithEnter);
    const safety = resolveSafetyOptions(options);
    assertCommandSyntaxAllowed(command, safety.safetyLevel);

    const user = resolveUserId(options.user);

    if (options.dry_run) {
      return createDryRunResult({
        text: `Commande simulee: ${command}`,
        action: 'command',
        request: { command, user: user ?? null },
        oscAddress: oscMappings.commands.command,
        oscArgs: buildOscDescriptor(command, user ?? null).args,
        cli: { text: command }
      });
    }

    if (isSensitiveCommandText(command)) {
      assertSensitiveActionAllowed(options, 'eos_command');
    }

    await client.sendCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const verification = await resolveSensitiveCommandVerification(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      timeoutMs: options.verification_timeout_ms,
      verifyAfterSend: options.verify_after_send
    });

    return formatSendResult(command, user ?? null, oscMappings.commands.command, verification);
  }
};

const newCommandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  substitutions: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  clearLine: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_new_command
 * @summary Nouvelle commande EOS
 * @description Efface optionnellement la ligne de commande puis envoie le texte fourni. A n'utiliser que lorsqu'aucun outil dedie n'existe. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.
 * @arguments Voir docs/tools.md#eos-new-command pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-new-command pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-new-command pour un exemple OSC.
 */
export const eosNewCommandTool: ToolDefinition<typeof newCommandInputSchema> = {
  name: 'eos_new_command',
  config: {
    title: 'Nouvelle commande EOS',
    description:
      "Efface optionnellement la ligne de commande puis envoie le texte fourni. A n'utiliser que lorsqu'aucun outil dedie n'existe. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.",
    inputSchema: newCommandInputSchema,
    annotations: {
      ...mappingAnnotations(oscMappings.commands.newCommand, 'command_line_new'),
      recommendedUsage: cueProgrammingGuardrails
    }
  },
  handler: async (args, _extra) => {
    const schema = z.object(newCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const substituted = applySubstitutions(options.command, options.substitutions ?? []);
    assertNoComposedCueProgrammingCommand(substituted);
    const safety = resolveSafetyOptions(options);
    assertCommandSyntaxAllowed(substituted, safety.safetyLevel);
    if (!options.dry_run && isSensitiveCommandText(substituted)) {
      assertSensitiveActionAllowed(options, 'eos_new_command');
    }
    return sendDeterministicCommand({
      command: substituted,
      terminateWithEnter: options.terminateWithEnter,
      clearLine: options.clearLine,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      dry_run: options.dry_run,
      verify_after_send: options.verify_after_send,
      verification_timeout_ms: options.verification_timeout_ms,
      require_confirmation: options.require_confirmation,
      safety_level: options.safety_level
    });
  }
};

const substitutionCommandInputSchema = {
  template: z.string().min(1, 'Le gabarit ne peut pas etre vide'),
  values: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_command_with_substitution
 * @summary Commande avec substitution
 * @description Applique des substitutions %1, %2, ... puis envoie la commande.
 * @arguments Voir docs/tools.md#eos-command-with-substitution pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-command-with-substitution pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-command-with-substitution pour un exemple OSC.
 */
export const eosCommandWithSubstitutionTool: ToolDefinition<typeof substitutionCommandInputSchema> = {
  name: 'eos_command_with_substitution',
  config: {
    title: 'Commande avec substitution',
    description: 'Applique des substitutions %1, %2, ... puis envoie la commande.',
    inputSchema: substitutionCommandInputSchema,
    annotations: mappingAnnotations(oscMappings.commands.command, 'command_line_template')
  },
  handler: async (args, _extra) => {
    const schema = z.object(substitutionCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const substituted = applySubstitutions(options.template, options.values ?? []);
    const command = ensureTerminator(substituted, options.terminateWithEnter);
    const safety = resolveSafetyOptions(options);
    assertCommandSyntaxAllowed(command, safety.safetyLevel);

    const user = resolveUserId(options.user);

    if (options.dry_run) {
      return createDryRunResult({
        text: `Commande simulee: ${command}`,
        action: 'command',
        request: { command, user: user ?? null },
        oscAddress: oscMappings.commands.command,
        oscArgs: buildOscDescriptor(command, user ?? null).args,
        cli: { text: command }
      });
    }

    if (isSensitiveCommandText(command)) {
      assertSensitiveActionAllowed(options, 'eos_command_with_substitution');
    }

    await client.sendCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const verification = await resolveSensitiveCommandVerification(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      timeoutMs: options.verification_timeout_ms,
      verifyAfterSend: options.verify_after_send
    });

    return formatSendResult(command, user ?? null, oscMappings.commands.command, verification);
  }
};

const commandLineInputSchema = {
  user: z.coerce.number().int().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  ...targetOptionsSchema
};

const userCommandLineInputSchema = {
  user: z.coerce.number().int().min(0),
  timeoutMs: z.coerce.number().int().positive().optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_get_command_line
 * @summary Lecture de la ligne de commande EOS
 * @description Recupere le contenu courant de la ligne de commande via OSC Get.
 * @arguments Voir docs/tools.md#eos-get-command-line pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-command-line pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-command-line pour un exemple OSC.
 */
export const eosGetCommandLineTool: ToolDefinition<typeof commandLineInputSchema> = {
  name: 'eos_get_command_line',
  config: {
    title: 'Lecture de la ligne de commande EOS',
    description: 'Recupere le contenu courant de la ligne de commande via OSC Get.',
    inputSchema: commandLineInputSchema,
    annotations: mappingAnnotations(oscMappings.commands.getCommandLine, 'command_line_query')
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandLineInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const user = resolveUserId(options.user);
    if (options.dry_run) {
      return createDryRunResult({
        text: `Lecture ligne de commande simulee pour utilisateur ${user ?? 'global'}`,
        action: 'get_command_line',
        request: { user: user ?? null },
        oscAddress: oscMappings.commands.getCommandLine,
        oscArgs: { user: user ?? null }
      });
    }

    const result = await client.getCommandLine({
      user,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatCommandLineState(result);
  }
};

/**
 * @tool eos_get_user_command_line
 * @summary Lecture de la ligne de commande utilisateur
 * @description Recupere la ligne de commande pour un utilisateur specifique.
 * @arguments Voir docs/tools.md#eos-get-user-command-line pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-user-command-line pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-user-command-line pour un exemple OSC.
 */
export const eosGetUserCommandLineTool: ToolDefinition<typeof userCommandLineInputSchema> = {
  name: 'eos_get_user_command_line',
  config: {
    title: 'Lecture de la ligne de commande utilisateur',
    description: 'Recupere la ligne de commande pour un utilisateur specifique.',
    inputSchema: userCommandLineInputSchema,
    annotations: mappingAnnotations(oscMappings.commands.getCommandLine, 'user_command_line_query')
  },
  handler: async (args, _extra) => {
    const schema = z.object(userCommandLineInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const user = Math.trunc(options.user);

    if (options.dry_run) {
      return createDryRunResult({
        text: `Lecture ligne de commande simulee pour utilisateur ${user}`,
        action: 'get_user_command_line',
        request: { user },
        oscAddress: oscMappings.commands.getCommandLine,
        oscArgs: { user }
      });
    }

    const result = await client.getCommandLine({
      user,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatCommandLineState(result);
  }
};

export const commandTools = withToolMetadata([
  eosCommandTool,
  eosNewCommandTool,
  eosCommandWithSubstitutionTool,
  eosGetCommandLineTool,
  eosGetUserCommandLineTool
], {
  category: 'commands',
  synonyms: ['command line', 'cmd', 'newcmd', 'texte eos', 'ligne de commande'],
  riskLevel: 'high',
  requiresConfirmation: true,
  preferredWorkflow: ['eos_workflow_create_look', 'eos_workflow_update_cue_look']
}) as ToolDefinition[];

export default commandTools;
