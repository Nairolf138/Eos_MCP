import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { ToolDefinition } from '../types';

const inputSchema = {
  path: z.string().min(1),
  enable: z.boolean().optional(),
  rateHz: z.number().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  transportPreference: z.enum(['reliability', 'speed', 'auto']).optional()
};

/**
 * @tool eos_subscribe
 * @summary Souscription OSC EOS
 * @description Active ou desactive une souscription OSC sur la console EOS.
 * @arguments Voir docs/tools.md#eos-subscribe pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-subscribe pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-subscribe pour un exemple OSC.
 */
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
    const { transportPreference, ...subscribeOptions } = options;
    const result = await client.subscribe({
      ...subscribeOptions,
      toolId: 'eos_subscribe',
      transportPreference
    });

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
        }
      ],
      structuredContent: result
    };
  }
};

export default eosSubscribeTool;
