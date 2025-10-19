import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import { buildJsonArgs, extractTargetOptions, targetOptionsSchema } from './common';

const bankPageInputSchema = {
  bank_index: z.number().int().min(0),
  delta: z.number().int(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

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
    const payload = {
      bank: options.bank_index,
      delta: options.delta
    };

    client.sendMessage(oscMappings.cues.bankPage, buildJsonArgs(payload), extractTargetOptions(options));

    const text = `Bank ${options.bank_index}: changement de page (${options.delta >= 0 ? '+' : ''}${options.delta})`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cuelist_bank_page',
            request: payload,
            osc: {
              address: oscMappings.cues.bankPage,
              args: payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCuelistBankPageTool;
