import { z } from 'zod';
import { getOscClient } from '../../services/osc/client.js';
import type { ToolDefinition } from '../types.js';

const inputSchema = {
  path: z.string().min(1),
  enable: z.boolean().optional(),
  rateHz: z.number().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
};

export const eosSubscribeTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_subscribe',
  config: {
    title: 'Souscription OSC EOS',
    description: 'Active ou desactive une souscription OSC sur la console EOS.',
    inputSchema
  },
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const result = await client.subscribe(options);

    const lines = [
      `Souscription: ${result.status}`,
      `Chemin: ${result.path}`
    ];

    if (typeof options.rateHz === 'number') {
      lines.push(`Frequence: ${options.rateHz} Hz`);
    }

    if (options.enable === false) {
      lines.push('Action: desactivation');
    } else {
      lines.push('Action: activation');
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

export default eosSubscribeTool;
