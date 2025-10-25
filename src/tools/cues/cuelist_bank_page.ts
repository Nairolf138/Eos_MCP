import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import { extractTargetOptions, resolveOscAddress, targetOptionsSchema } from './common';

const bankPageInputSchema = {
  bank_index: z.number().int().min(0),
  delta: z.number().int(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cuelist_bank_page
 * @summary Navigation de bank de cuelist
 * @description Change de page dans un bank de cues en ajoutant le delta specifie.
 * @arguments Voir docs/tools.md#eos-cuelist-bank-page pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cuelist-bank-page pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cuelist-bank-page pour un exemple OSC.
 */
export const eosCuelistBankPageTool: ToolDefinition<typeof bankPageInputSchema> = {
  name: 'eos_cuelist_bank_page',
  config: {
    title: 'Navigation de bank de cuelist',
    description: 'Change de page dans un bank de cues en ajoutant le delta specifie.',
    inputSchema: bankPageInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.bankPage
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(bankPageInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const bankIndex = options.bank_index;
    const delta = Math.trunc(options.delta);
    const target = extractTargetOptions(options);
    const address = resolveOscAddress(oscMappings.cues.bankPage, { index: bankIndex, delta });

    await client.sendMessage(address, [], target);

    const text = `Bank ${options.bank_index}: changement de page (${delta >= 0 ? '+' : ''}${delta})`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cuelist_bank_page',
            request: {
              bank: bankIndex,
              delta
            },
            osc: {
              address,
              args: []
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCuelistBankPageTool;
