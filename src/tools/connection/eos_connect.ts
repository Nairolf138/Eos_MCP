import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const inputSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  preferredProtocols: z.array(z.string().min(1)).min(1).optional(),
  handshakeTimeoutMs: z.coerce.number().int().positive().optional(),
  protocolTimeoutMs: z.coerce.number().int().positive().optional(),
  clientId: z.string().min(1).optional(),
  transportPreference: z.enum(['reliability', 'speed', 'auto']).optional()
};

/**
 * @tool eos_connect
 * @summary Connexion OSC EOS
 * @description Initie un handshake OSC avec la console EOS, choisit un protocole et retourne la version detectee.
 * @arguments Voir docs/tools.md#eos-connect pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-connect pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-connect pour un exemple OSC.
 */
export const eosConnectTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_connect',
  config: {
    title: 'Connexion OSC EOS',
    description: 'Initie un handshake OSC avec la console EOS, choisit un protocole et retourne la version detectee.',
    inputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const { transportPreference, ...connectOptions } = options;
    const result = await client.connect({
      ...connectOptions,
      toolId: 'eos_connect',
      transportPreference
    });

    const summaryParts = [
      `Handshake: ${result.status}`,
      `Protocoles disponibles: ${result.availableProtocols.length > 0 ? result.availableProtocols.join(', ') : 'aucun'}`,
      `Protocole selectionne: ${result.selectedProtocol ?? 'non defini'} (${result.protocolStatus})`,
      `Version detectee: ${result.version ?? 'inconnue'}`
    ];

    return {
      content: [
        {
          type: 'text',
          text: summaryParts.join('\n')
        }
      ],
      structuredContent: result
    } as unknown as ToolExecutionResult;
  }
};

export default eosConnectTool;
