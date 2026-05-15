/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { getResourceCache, type CacheStatsByResource } from '../../services/cache/index';
import { getOscClient } from '../../services/osc/client';
import type { OscDiagnostics, OscLoggingState } from '../../services/osc/index';
import { oscMappings, oscResponseMappings, withEosOutResponseVariant } from '../../services/osc/mappings';
import { optionalPortSchema, optionalTimeoutMsSchema } from '../../utils/validators';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: optionalPortSchema
};

const loggingInputSchema = {
  incoming: z.boolean().optional(),
  outgoing: z.boolean().optional()
};

const emptyInputSchema = {} as const;

const systemQueryInputSchema = {
  timeoutMs: optionalTimeoutMsSchema,
  ...targetOptionsSchema
} as const;

const readinessInputSchema = {
  timeoutMs: optionalTimeoutMsSchema,
  handshakeTimeoutMs: optionalTimeoutMsSchema,
  protocolTimeoutMs: optionalTimeoutMsSchema,
  targetAddress: z.string().min(1).optional(),
  targetPort: optionalPortSchema,
  transportPreference: z.enum(['reliability', 'speed', 'auto']).optional(),
  user: z.coerce.number().int().min(0).max(999).optional(),
  countTarget: z.enum(['cue', 'group', 'preset']).optional(),
  patchChannel: z.coerce.number().int().min(1).max(99999).optional(),
  patchPart: z.coerce.number().int().min(0).max(99).optional()
} as const;

interface ReadinessCheck {
  name: string;
  status: string;
  details?: Record<string, unknown>;
  error?: string | null;
}

const isOkStatus = (status: unknown): boolean => status === 'ok';

const recordFailedCheck = (checks: ReadinessCheck[]): string[] => checks
  .filter((check) => !isOkStatus(check.status) && check.status !== 'skipped')
  .map((check) => check.name);

const getReadinessOperatorActions = (
  failedChecks: string[],
  handshakeMode: string,
  jsonReadSupported: boolean
): string[] => {
  const actions: string[] = [];

  if (failedChecks.includes('ping')) {
    actions.push('Verifier l adresse IP, le port OSC, le reseau et l activation OSC RX/TX sur EOS.');
  }

  if (failedChecks.includes('handshake') || handshakeMode === 'timeout') {
    actions.push('Relancer eos_configure/eos_connect avec la cible correcte puis verifier que la console EOS accepte le handshake OSC.');
  }

  if (!jsonReadSupported) {
    actions.push('Confirmer le support des requetes /eos/get/*: privilegier un transport fiable, activer les reponses OSC et ne pas inventer de patch/cues sans lecture explicite.');
  }

  if (failedChecks.includes('patch_read')) {
    actions.push('Si la lecture patch est necessaire, fournir un canal patche valide via patchChannel ou verifier que le canal existe dans le show.');
  }

  if (actions.length === 0) {
    actions.push('Readiness validee: continuer avec les outils de lecture ou de workflow adaptes.');
  }

  return actions;
};

const normaliseReadinessCountTarget = (target: 'cue' | 'group' | 'preset' | undefined) => target ?? 'cue';

const getCountAddress = (target: 'cue' | 'group' | 'preset'): string => {
  switch (target) {
    case 'group':
      return oscMappings.queries.group.count;
    case 'preset':
      return oscMappings.queries.preset.count;
    case 'cue':
    default:
      return oscMappings.queries.cue.count;
  }
};

const getCountResponseAddresses = (target: 'cue' | 'group' | 'preset'): readonly string[] => {
  switch (target) {
    case 'group':
      return oscResponseMappings.queries.group.count;
    case 'preset':
      return oscResponseMappings.queries.preset.count;
    case 'cue':
    default:
      return oscResponseMappings.queries.cue.count;
  }
};

const formatLoggingState = (state: OscLoggingState): string => {
  const lines = [
    `Journalisation entrante: ${state.incoming ? 'activee' : 'desactivee'}`,
    `Journalisation sortante: ${state.outgoing ? 'activee' : 'desactivee'}`
  ];
  return lines.join('\n');
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes)) {
    return 'n/a';
  }
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} Ko`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)} Mo`;
};

const formatDirectionStats = (label: string, diagnostics: OscDiagnostics, key: 'incoming' | 'outgoing'): string => {
  const stats = diagnostics.stats[key];
  const base = `${label}: ${stats.count} messages, ${formatBytes(stats.bytes)}`;
  const lastMessage = stats.lastTimestamp ? new Date(stats.lastTimestamp).toISOString() : 'jamais';
  const lines = [base, `  Dernier message: ${lastMessage}`];

  if (stats.addresses.length > 0) {
    lines.push('  Adresses principales:');
    stats.addresses.slice(0, 3).forEach((address) => {
      const seen = address.count === 1 ? '1 message' : `${address.count} messages`;
      const lastSeen = address.lastTimestamp ? new Date(address.lastTimestamp).toISOString() : 'jamais';
      lines.push(`    • ${address.address} (${seen}, dernier: ${lastSeen})`);
    });
  }

  return lines.join('\n');
};

const formatCacheStats = (cache: CacheStatsByResource): string => {
  const lines = [
    `Cache ressources: ${cache.totals.entries} entree(s), ${cache.totals.hits} hit(s), ${cache.totals.misses} miss(es)`
  ];

  Object.entries(cache.resources)
    .filter(([, stats]) => stats.entries > 0 || stats.hits > 0 || stats.misses > 0)
    .forEach(([resource, stats]) => {
      lines.push(`  • ${resource}: ${stats.entries} entree(s), ${stats.hits} hit(s), ${stats.misses} miss(es)`);
    });

  return lines.join('\n');
};

const formatDiagnostics = (diagnostics: OscDiagnostics, cache: CacheStatsByResource): string => {
  const lines = [
    'Configuration OSC:',
    `- Local: ${diagnostics.config.localAddress}:${diagnostics.config.localPort}`,
    `- Remote: ${diagnostics.config.remoteAddress ?? 'inconnu'}:${diagnostics.config.remotePort ?? 'n/a'}`,
    '',
    'Journalisation:',
    `- Entrante: ${diagnostics.logging.incoming ? 'activee' : 'desactivee'}`,
    `- Sortante: ${diagnostics.logging.outgoing ? 'activee' : 'desactivee'}`,
    '',
    'Statistiques messages:',
    formatDirectionStats('  Entrants', diagnostics, 'incoming'),
    formatDirectionStats('  Sortants', diagnostics, 'outgoing'),
    '',
    formatCacheStats(cache),
    '',
    `Auditeurs actifs: ${diagnostics.listeners.active}`,
    `Demarrage service: ${new Date(diagnostics.startedAt).toISOString()}`,
    `Uptime: ${(diagnostics.uptimeMs / 1000).toFixed(2)} s`
  ];

  return lines.join('\n');
};

const extractTargetOptions = (options: { targetAddress?: string; targetPort?: number }) => {
  const target: { targetAddress?: string; targetPort?: number } = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
};

const normaliseString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.version,
      record.show,
      record.name,
      record.label,
      record.text,
      record.value
    ];
    for (const candidate of candidates) {
      const normalised = normaliseString(candidate);
      if (normalised) {
        return normalised;
      }
    }
  }

  return null;
};

/**
 * @tool eos_enable_logging
 * @summary Basculer le logging OSC
 * @description Active ou desactive la journalisation des messages OSC entrants et sortants.
 * @arguments Voir docs/tools.md#eos-enable-logging pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-enable-logging pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-enable-logging pour un exemple OSC.
 */
export const eosEnableLoggingTool: ToolDefinition<typeof loggingInputSchema> = {
  name: 'eos_enable_logging',
  config: {
    title: 'Basculer le logging OSC',
    description: 'Active ou desactive la journalisation des messages OSC entrants et sortants.',
    inputSchema: loggingInputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(loggingInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = client.setLogging(options);
    const summary = formatLoggingState(state);

    return {
      content: [
        {
          type: 'text',
          text: summary
        }
      ],
      structuredContent: { logging: state }
    } as unknown as ToolExecutionResult;
  }
};

/**
 * @tool eos_readiness_check
 * @summary Verification de readiness EOS
 * @description Premiere etape obligatoire: controle read-only du transport OSC, du handshake et des lectures JSON EOS.
 * @arguments Voir docs/tools.md#eos-readiness-check pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-readiness-check pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-readiness-check pour un exemple OSC.
 */
export const eosReadinessCheckTool: ToolDefinition<typeof readinessInputSchema> = {
  name: 'eos_readiness_check',
  config: {
    title: 'Verification de readiness EOS',
    description: 'Premiere etape obligatoire: controle read-only du transport OSC, du handshake et des lectures JSON EOS.',
    inputSchema: readinessInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  metadata: {
    category: 'diagnostics',
    riskLevel: 'low',
    preferredWorkflow: 'first_step'
  },
  handler: async (args, _extra) => {
    const schema = z.object(readinessInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const target = extractTargetOptions(options);
    const timeoutMs = options.timeoutMs;
    const checks: ReadinessCheck[] = [];

    const ping = await client.ping({
      ...target,
      timeoutMs,
      toolId: 'eos_readiness_check',
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'ping',
      status: ping.status,
      details: {
        roundtripMs: ping.roundtripMs,
        echo: ping.echo
      },
      error: ping.error ?? null
    });

    const handshake = await client.connect({
      ...target,
      handshakeTimeoutMs: options.handshakeTimeoutMs,
      protocolTimeoutMs: options.protocolTimeoutMs,
      toolId: 'eos_readiness_check',
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'handshake',
      status: handshake.status,
      details: {
        handshake_mode: handshake.handshake_mode,
        selectedProtocol: handshake.selectedProtocol,
        protocolStatus: handshake.protocolStatus,
        can_send_commands: handshake.can_send_commands,
        can_read_queries: handshake.can_read_queries
      },
      error: handshake.error ?? null
    });

    const version = await client.requestJson(oscMappings.system.getVersion, {
      ...target,
      timeoutMs,
      bypassReadCapabilityCheck: true,
      responseAddresses: withEosOutResponseVariant(oscMappings.system.getVersion),
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'version',
      status: version.status,
      details: {
        version: normaliseString(version.data),
        diagnostics: version.diagnostics ?? null
      },
      error: version.error ?? null
    });

    const commandLine = await client.getCommandLine({
      ...target,
      user: options.user,
      timeoutMs,
      toolId: 'eos_readiness_check',
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'command_line_get',
      status: commandLine.status,
      details: {
        user: commandLine.user,
        text: commandLine.text
      },
      error: commandLine.error ?? null
    });

    const showName = await client.requestJson(oscMappings.showControl.showName, {
      ...target,
      timeoutMs,
      bypassReadCapabilityCheck: true,
      responseAddresses: withEosOutResponseVariant(oscMappings.showControl.showName),
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'show_name',
      status: showName.status,
      details: {
        show_name: normaliseString(showName.data),
        diagnostics: showName.diagnostics ?? null
      },
      error: showName.error ?? null
    });

    const countTarget = normaliseReadinessCountTarget(options.countTarget);
    const count = await client.requestJson(getCountAddress(countTarget), {
      ...target,
      timeoutMs,
      bypassReadCapabilityCheck: true,
      responseAddresses: getCountResponseAddresses(countTarget),
      transportPreference: options.transportPreference
    });
    checks.push({
      name: 'count',
      status: count.status,
      details: {
        target: countTarget,
        data: count.data,
        diagnostics: count.diagnostics ?? null
      },
      error: count.error ?? null
    });

    if (typeof options.patchChannel === 'number') {
      const patchPayload = {
        channel: options.patchChannel,
        part: options.patchPart ?? 0
      };
      const patchRead = await client.requestJson(oscMappings.patch.channelInfo, {
        ...target,
        payload: patchPayload,
        timeoutMs,
        bypassReadCapabilityCheck: true,
        responseAddresses: oscResponseMappings.patch.channelInfo,
        transportPreference: options.transportPreference
      });
      checks.push({
        name: 'patch_read',
        status: patchRead.status,
        details: {
          channel: options.patchChannel,
          part: options.patchPart ?? 0,
          data: patchRead.data,
          diagnostics: patchRead.diagnostics ?? null
        },
        error: patchRead.error ?? null
      });
    } else {
      checks.push({
        name: 'patch_read',
        status: 'skipped',
        details: {
          reason: 'Aucun patchChannel fourni; lecture patch optionnelle non executee.'
        },
        error: null
      });
    }

    const failedChecks = recordFailedCheck(checks);
    const jsonReadSupported = ['version', 'show_name', 'count']
      .every((name) => checks.some((check) => check.name === name && check.status === 'ok'));
    const transportStatus = ping.status === 'ok' && handshake.status === 'ok'
      ? 'ok'
      : ping.status === 'ok' || handshake.can_send_commands
        ? 'degraded'
        : 'error';
    const overallStatus = failedChecks.length === 0
      ? 'ok'
      : transportStatus === 'error'
        ? 'error'
        : 'degraded';
    const operatorActions = getReadinessOperatorActions(failedChecks, handshake.handshake_mode, jsonReadSupported);

    const text = [
      `Readiness EOS: ${overallStatus}`,
      `Transport: ${transportStatus}`,
      `Handshake: ${handshake.handshake_mode}`,
      `Lecture JSON: ${jsonReadSupported ? 'supportee' : 'non confirmee'}`,
      `Echecs: ${failedChecks.length > 0 ? failedChecks.join(', ') : 'aucun'}`
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text
        }
      ],
      structuredContent: {
        status: overallStatus,
        overall_status: overallStatus,
        transport_status: transportStatus,
        handshake_mode: handshake.handshake_mode,
        json_read_supported: jsonReadSupported,
        failed_checks: failedChecks,
        operator_actions: operatorActions,
        checks,
        summary: text,
        commandsSent: [],
        commands_preview: [],
        warnings: [],
        next_actions: operatorActions
      }
    } as unknown as ToolExecutionResult;
  }
};

/**
 * @tool eos_get_diagnostics
 * @summary Diagnostics OSC
 * @description Recupere les informations de diagnostic du service OSC.
 * @arguments Voir docs/tools.md#eos-get-diagnostics pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-diagnostics pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-diagnostics pour un exemple OSC.
 */
export const eosGetDiagnosticsTool: ToolDefinition<typeof emptyInputSchema> = {
  name: 'eos_get_diagnostics',
  config: {
    title: 'Diagnostics OSC',
    description: 'Recupere les informations de diagnostic du service OSC.',
    inputSchema: emptyInputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(emptyInputSchema).strict();
    schema.parse(args ?? {});
    const client = getOscClient();
    const diagnostics = client.getDiagnostics();
    const cache = getResourceCache().getStatsSnapshot();
    const summary = formatDiagnostics(diagnostics, cache);

    return {
      content: [
        {
          type: 'text',
          text: summary
        }
      ],
      structuredContent: { ...diagnostics, cache }
    } as unknown as ToolExecutionResult;
  }
};

/**
 * @tool eos_get_version
 * @summary Version de la console
 * @description Recupere la version logicielle signalee par la console EOS.
 * @arguments Voir docs/tools.md#eos-get-version pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-version pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-version pour un exemple OSC.
 */
export const eosGetVersionTool: ToolDefinition<typeof systemQueryInputSchema> = {
  name: 'eos_get_version',
  config: {
    title: 'Version de la console',
    description: 'Recupere la version logicielle signalee par la console EOS.',
    inputSchema: systemQueryInputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(systemQueryInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const response = await client.requestJson(oscMappings.system.getVersion, {
      timeoutMs: options.timeoutMs,
      ...extractTargetOptions(options),
      responseAddresses: [oscMappings.system.getVersion, '/eos/out/get/version']
    });
    const version = normaliseString(response.data);
    const text = response.status === 'ok' && version
      ? `Version EOS: ${version}`
      : `Version EOS indisponible (statut ${response.status})`;

    return {
      content: [
        {
          type: 'text',
          text
        }
      ],
      structuredContent: {
        action: 'get_version',
        status: response.status,
        version: version ?? null,
        data: response.data,
        error: response.error ?? null,
        osc: {
          address: oscMappings.system.getVersion
        }
      }
    } as unknown as ToolExecutionResult;
  }
};

/**
 * @tool eos_get_setup_defaults
 * @summary Defaults de setup
 * @description Recupere les valeurs par defaut de setup exposees par la console EOS.
 * @arguments Voir docs/tools.md#eos-get-setup-defaults pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-setup-defaults pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-setup-defaults pour un exemple OSC.
 */
export const eosGetSetupDefaultsTool: ToolDefinition<typeof systemQueryInputSchema> = {
  name: 'eos_get_setup_defaults',
  config: {
    title: 'Defaults de setup',
    description: 'Recupere les valeurs par defaut de setup exposees par la console EOS.',
    inputSchema: systemQueryInputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(systemQueryInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const response = await client.requestJson(oscMappings.system.getSetupDefaults, {
      timeoutMs: options.timeoutMs,
      ...extractTargetOptions(options)
    });
    const text = response.status === 'ok'
      ? 'Defaults de setup recuperes.'
      : `Defaults de setup indisponibles (statut ${response.status})`;

    return {
      content: [
        {
          type: 'text',
          text
        }
      ],
      structuredContent: {
        action: 'get_setup_defaults',
        status: response.status,
        data: response.data,
        error: response.error ?? null,
        osc: {
          address: oscMappings.system.getSetupDefaults
        }
      }
    } as unknown as ToolExecutionResult;
  }
};

const diagnosticsTools: ToolDefinition[] = [
  eosEnableLoggingTool,
  eosReadinessCheckTool,
  eosGetDiagnosticsTool,
  eosGetVersionTool,
  eosGetSetupDefaultsTool
];

export default diagnosticsTools;
