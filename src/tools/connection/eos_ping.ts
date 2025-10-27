import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { optionalPortSchema, optionalTimeoutMsSchema } from '../../utils/validators';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const inputSchema = {
  message: z.string().min(1).optional(),
  timeoutMs: optionalTimeoutMsSchema,
  targetAddress: z.string().min(1).optional(),
  targetPort: optionalPortSchema,
  transportPreference: z.enum(['reliability', 'speed', 'auto']).optional()
};

/**
 * @tool eos_ping
 * @summary Ping OSC EOS
 * @description Envoie un ping OSC a la console EOS et retourne le statut.
 * @arguments Voir docs/tools.md#eos-ping pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-ping pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-ping pour un exemple OSC.
 */
export const eosPingTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_ping',
  config: {
    title: 'Ping OSC EOS',
    description: 'Envoie un ping OSC a la console EOS et retourne le statut.',
    inputSchema
  },
  handler: async (args, _extra) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const { transportPreference, ...pingOptions } = options;
    const result = await client.ping({
      ...pingOptions,
      toolId: 'eos_ping',
      transportPreference
    });

    const lines = [
      `Ping: ${result.status}`,
      `Delai aller-retour: ${result.roundtripMs ?? 'n/a'} ms`,
      `Echo: ${result.echo ?? 'aucun'}`
    ];

    if (result.error) {
      lines.push(`Erreur: ${result.error}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n')
        }
      ],
      structuredContent: result
    } as unknown as ToolExecutionResult;
  }
};

export default eosPingTool;
