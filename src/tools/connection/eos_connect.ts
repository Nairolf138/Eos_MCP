import { z } from 'zod';
import { getOscClient } from '../../services/osc/client.js';
import type { ToolDefinition } from '../types.js';

const inputSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  preferredProtocols: z.array(z.string().min(1)).min(1).optional(),
  handshakeTimeoutMs: z.number().int().positive().optional(),
  protocolTimeoutMs: z.number().int().positive().optional(),
  clientId: z.string().min(1).optional()
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
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const result = await client.connect(options);

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
        },
        {
          type: 'object',
          data: result
        }
      ]
    };
  }
};

export default eosConnectTool;
