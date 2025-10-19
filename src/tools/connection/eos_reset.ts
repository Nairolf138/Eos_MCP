import { z } from 'zod';
import { getOscClient } from '../../services/osc/client.js';
import type { ToolDefinition } from '../types.js';

const inputSchema = {
  full: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
};

export const eosResetTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_reset',
  config: {
    title: 'Reset OSC EOS',
    description: 'Envoie une commande de reset a la console EOS.',
    inputSchema
  },
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const result = await client.reset(options);

    const lines = [`Reset: ${result.status}`];
    if (options.full) {
      lines.push('Mode: complet');
    } else {
      lines.push('Mode: partiel');
    }

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

export default eosResetTool;
