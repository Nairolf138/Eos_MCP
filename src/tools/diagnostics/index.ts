import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { OscDiagnostics, OscLoggingState } from '../../services/osc/index';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const loggingInputSchema = {
  incoming: z.boolean().optional(),
  outgoing: z.boolean().optional()
};

const emptyInputSchema = {} as const;

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

const formatDiagnostics = (diagnostics: OscDiagnostics): string => {
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
    `Auditeurs actifs: ${diagnostics.listeners.active}`,
    `Demarrage service: ${new Date(diagnostics.startedAt).toISOString()}`,
    `Uptime: ${(diagnostics.uptimeMs / 1000).toFixed(2)} s`
  ];

  return lines.join('\n');
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
    const summary = formatDiagnostics(diagnostics);

    return {
      content: [
        {
          type: 'text',
          text: summary
        }
      ],
      structuredContent: diagnostics
    } as unknown as ToolExecutionResult;
  }
};

const diagnosticsTools: ToolDefinition[] = [eosEnableLoggingTool, eosGetDiagnosticsTool];

export default diagnosticsTools;
