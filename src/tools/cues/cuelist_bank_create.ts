import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  createCueIdentifierFromOptions,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
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
        osc: oscMappings.cues.bankCreate,
        args: []
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(bankCreateInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);

    if (identifier.cuelistNumber == null) {
      throw new Error("Le numero de cuelist est requis pour configurer un bank.");
    }

    const segments = [
      'eos',
      'cuelist',
      String(options.bank_index),
      'config',
      String(identifier.cuelistNumber),
      String(options.num_prev_cues),
      String(options.num_pending_cues)
    ];

    let offset: number | undefined;
    if (typeof options.offset === 'number') {
      offset = Math.trunc(options.offset);
      segments.push(String(offset));
    }

    const address = `/${segments.join('/')}`;

    await client.sendMessage(address, [], extractTargetOptions(options));

    const text = `Bank ${options.bank_index} assigne a ${formatCueDescription({
      ...identifier,
      cueNumber: null,
      cuePart: null
    })}`;

    const request: Record<string, number> & { offset?: number } = {
      bankIndex: options.bank_index,
      cuelistNumber: identifier.cuelistNumber,
      previousCount: options.num_prev_cues,
      pendingCount: options.num_pending_cues
    };

    if (offset != null) {
      request.offset = offset;
    }

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cuelist_bank_create',
            request,
            osc: {
              address,
              args: [] as const
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCuelistBankCreateTool;
