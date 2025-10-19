import { z } from 'zod';
import { getOscClient, type CommandLineState } from '../../services/osc/client';
import type { ToolDefinition, ToolExecutionResult } from '../types';

type SubstitutionValue = string | number | boolean;

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
};

const substitutionsSchema = z.array(z.union([z.string(), z.number(), z.boolean()])).optional();

const mappingAnnotations = (osc: string, cli: string): Record<string, unknown> => ({
  mapping: {
    osc,
    cli
  }
});

function ensureTerminator(command: string, terminate?: boolean): string {
  if (!terminate) {
    return command;
  }

  return command.endsWith('#') ? command : `${command}#`;
}

function applySubstitutions(template: string, values: SubstitutionValue[] = []): string {
  const normalisedValues = values.map((value) => String(value));
  return template.replace(/%(%|\d+)/g, (match, group) => {
    if (group === '%') {
      return '%';
    }

    const index = Number.parseInt(group, 10);
    if (Number.isNaN(index) || index < 1) {
      return '';
    }

    const replacement = normalisedValues[index - 1];
    return replacement ?? '';
  });
}

function buildOscDescriptor(command: string, user?: number | null): Record<string, unknown> {
  const args: Array<{ type: string; value: string | number }> = [{ type: 's', value: command }];
  if (typeof user === 'number' && Number.isFinite(user)) {
    args.push({ type: 'i', value: Math.trunc(user) });
  }
  return { args };
}

function formatSendResult(command: string, user: number | null, oscAddress: string): ToolExecutionResult {
  return {
    content: [
      {
        type: 'text',
        text: `Commande envoyee sur ${oscAddress}: ${command}`
      },
      {
        type: 'object',
        data: {
          command,
          user,
          osc: {
            address: oscAddress,
            ...buildOscDescriptor(command, user)
          },
          cli: {
            text: command
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

function formatCommandLineState(result: CommandLineState): ToolExecutionResult {
  return {
    content: [
      {
        type: 'text',
        text: result.status === 'ok'
          ? `Ligne de commande utilisateur ${result.user ?? 'global'}: ${result.text}`
          : `Lecture de la ligne de commande indisponible (${result.status})`
      },
      {
        type: 'object',
        data: result
      }
    ]
  } as ToolExecutionResult;
}

const commandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  terminateWithEnter: z.boolean().optional(),
  user: z.number().int().min(0).optional(),
  ...targetOptionsSchema
};

export const eosCommandTool: ToolDefinition<typeof commandInputSchema> = {
  name: 'eos_command',
  config: {
    title: 'Commande EOS',
    description: 'Envoie du texte sur la ligne de commande existante de la console.',
    inputSchema: commandInputSchema,
    annotations: mappingAnnotations('/eos/cmd', 'command_line')
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const command = ensureTerminator(options.command, options.terminateWithEnter);

    client.sendCommand(command, {
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatSendResult(command, options.user ?? null, '/eos/cmd');
  }
};

const newCommandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  substitutions: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  clearLine: z.boolean().optional(),
  user: z.number().int().min(0).optional(),
  ...targetOptionsSchema
};

export const eosNewCommandTool: ToolDefinition<typeof newCommandInputSchema> = {
  name: 'eos_new_command',
  config: {
    title: 'Nouvelle commande EOS',
    description: 'Efface optionnellement la ligne de commande puis envoie le texte fourni.',
    inputSchema: newCommandInputSchema,
    annotations: mappingAnnotations('/eos/newcmd', 'command_line_new')
  },
  handler: async (args, _extra) => {
    const schema = z.object(newCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const substituted = applySubstitutions(options.command, options.substitutions ?? []);
    const command = ensureTerminator(substituted, options.terminateWithEnter);
    const shouldClear = options.clearLine !== false;

    if (shouldClear) {
      client.sendNewCommand(command, {
        user: options.user,
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      });
      return formatSendResult(command, options.user ?? null, '/eos/newcmd');
    }

    client.sendCommand(command, {
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatSendResult(command, options.user ?? null, '/eos/cmd');
  }
};

const substitutionCommandInputSchema = {
  template: z.string().min(1, 'Le gabarit ne peut pas etre vide'),
  values: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  user: z.number().int().min(0).optional(),
  ...targetOptionsSchema
};

export const eosCommandWithSubstitutionTool: ToolDefinition<typeof substitutionCommandInputSchema> = {
  name: 'eos_command_with_substitution',
  config: {
    title: 'Commande avec substitution',
    description: 'Applique des substitutions %1, %2, ... puis envoie la commande.',
    inputSchema: substitutionCommandInputSchema,
    annotations: mappingAnnotations('/eos/cmd', 'command_line_template')
  },
  handler: async (args, _extra) => {
    const schema = z.object(substitutionCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const substituted = applySubstitutions(options.template, options.values ?? []);
    const command = ensureTerminator(substituted, options.terminateWithEnter);

    client.sendCommand(command, {
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatSendResult(command, options.user ?? null, '/eos/cmd');
  }
};

const commandLineInputSchema = {
  user: z.number().int().min(0).optional(),
  timeoutMs: z.number().int().positive().optional(),
  ...targetOptionsSchema
};

export const eosGetCommandLineTool: ToolDefinition<typeof commandLineInputSchema> = {
  name: 'eos_get_command_line',
  config: {
    title: 'Lecture de la ligne de commande EOS',
    description: 'Recupere le contenu courant de la ligne de commande via OSC Get.',
    inputSchema: commandLineInputSchema,
    annotations: mappingAnnotations('/eos/get/cmd_line', 'command_line_query')
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandLineInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const result = await client.getCommandLine({
      user: options.user,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatCommandLineState(result);
  }
};

export const commandTools = [
  eosCommandTool,
  eosNewCommandTool,
  eosCommandWithSubstitutionTool,
  eosGetCommandLineTool
] as ToolDefinition[];

export default commandTools;
