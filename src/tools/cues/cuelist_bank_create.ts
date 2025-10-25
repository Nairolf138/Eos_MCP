import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { OscMessageArgument } from '../../services/osc/index';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  createCueIdentifierFromOptions,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  resolveOscAddress,
  targetOptionsSchema
} from './common';

const bankCreateInputSchema = {
  bank_index: z.number().int().min(0),
  cuelist_number: cuelistNumberSchema,
  num_prev_cues: z.number().int().min(0),
  num_pending_cues: z.number().int().min(0),
  offset: z.number().int().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cuelist_bank_create
 * @summary Creation de bank de cuelist
 * @description Configure un bank OSC pour surveiller une liste de cues.
 * @arguments Voir docs/tools.md#eos-cuelist-bank-create pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cuelist-bank-create pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cuelist-bank-create pour un exemple OSC.
 */
export const eosCuelistBankCreateTool: ToolDefinition<typeof bankCreateInputSchema> = {
  name: 'eos_cuelist_bank_create',
  config: {
    title: 'Creation de bank de cuelist',
    description: 'Configure un bank OSC pour surveiller une liste de cues.',
    inputSchema: bankCreateInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.bankCreate.list
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(bankCreateInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const bankIndex = options.bank_index;
    const target = extractTargetOptions(options);

    const configTemplates = oscMappings.cues.bankCreate;

    const messages: Array<{ address: string; args: OscMessageArgument[] }> = [
      {
        address: resolveOscAddress(configTemplates.list, { index: bankIndex }),
        args: buildIntArgs(options.cuelist_number)
      },
      {
        address: resolveOscAddress(configTemplates.previous, { index: bankIndex }),
        args: buildIntArgs(options.num_prev_cues)
      },
      {
        address: resolveOscAddress(configTemplates.pending, { index: bankIndex }),
        args: buildIntArgs(options.num_pending_cues)
      }
    ];

    if (typeof options.offset === 'number') {
      messages.push({
        address: resolveOscAddress(configTemplates.offset, { index: bankIndex }),
        args: buildIntArgs(options.offset)
      });
    }

    for (const message of messages) {
      await client.sendMessage(message.address, message.args, target);
    }

    const text = `Bank ${options.bank_index} assigne a ${formatCueDescription({
      ...identifier,
      cueNumber: null,
      cuePart: null
    })}`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cuelist_bank_create',
            request: {
              bank: bankIndex,
              cuelist: identifier.cuelistNumber,
              previous: options.num_prev_cues,
              pending: options.num_pending_cues,
              ...(typeof options.offset === 'number' ? { offset: options.offset } : {})
            },
            osc: {
              messages
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCuelistBankCreateTool;

function buildIntArgs(value: number): OscMessageArgument[] {
  return [
    {
      type: 'i',
      value: Math.trunc(value)
    }
  ];
}
