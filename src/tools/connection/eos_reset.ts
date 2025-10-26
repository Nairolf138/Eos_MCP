import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { ToolDefinition } from '../types';

const inputSchema = {
  full: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  transportPreference: z.enum(['reliability', 'speed', 'auto']).optional()
};

/**
 * @tool eos_reset
 * @summary Reset OSC EOS
 * @description Envoie une commande de reset a la console EOS.
 * @arguments Voir docs/tools.md#eos-reset pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-reset pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-reset pour un exemple OSC.
 */
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
    const { transportPreference, ...resetOptions } = options;
    const result = await client.reset({
      ...resetOptions,
      toolId: 'eos_reset',
      transportPreference
    });

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
        }
      ],
      structuredContent: result
    };
  }
};

export default eosResetTool;
