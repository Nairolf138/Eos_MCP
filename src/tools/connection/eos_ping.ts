import { z } from 'zod';
import { getOscClient } from '../../services/osc/client.js';
import type { ToolDefinition } from '../types.js';

const inputSchema = {
  message: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
};

export const eosPingTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_ping',
  config: {
    title: 'Ping OSC EOS',
    description: 'Envoie un ping OSC a la console EOS et retourne le statut.',
    inputSchema
  },
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const result = await client.ping(options);

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
        },
        {
          type: 'object',
          data: result
        }
      ]
    };
  }
};

export default eosPingTool;
