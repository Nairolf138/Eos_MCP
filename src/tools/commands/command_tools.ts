import { z } from 'zod';
import { getOscClient, type CommandLineState } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { getCurrentUserId } from '../session/index';
import { assertSensitiveActionAllowed, createDryRunResult, isSensitiveCommandText, safetyOptionsSchema } from '../common/safety';
import type { ToolDefinition, ToolExecutionResult } from '../types';

type SubstitutionValue = string | number | boolean;

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  ...safetyOptionsSchema
};

const substitutionsSchema = z.array(z.union([z.string(), z.number(), z.boolean()])).optional();

const mappingAnnotations = (osc: string, cli: string): Record<string, unknown> => ({
  mapping: {
    osc,
    cli
  }
});

const cueProgrammingGuardrails = {
  workflow: [
    'Programmer les cues en sequence explicite: selection, parametrage, record, label.',
    'Preferer eos_new_command avec clearLine=true pour eviter les restes de saisie.',
    'Activer terminateWithEnter=true pour valider sans concatenation ambigue de #.'
  ],
  manual: ['manual://eos#command-line', 'manual://eos#cue-timing', 'manual://eos#cue-playback']
};

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
      }
    ],
    structuredContent: {
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
  };
}

function formatCommandLineState(result: CommandLineState): ToolExecutionResult {
  return {
    content: [
      {
        type: 'text',
        text: result.status === 'ok'
          ? `Ligne de commande utilisateur ${result.user ?? 'global'}: ${result.text}`
          : `Lecture de la ligne de commande indisponible (${result.status})`
      }
    ],
    structuredContent: { ...result }
  };
}

function resolveUserId(requested?: number | null): number | undefined {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested >= 0) {
    return Math.trunc(requested);
  }

  const stored = getCurrentUserId();
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
    return Math.trunc(stored);
  }

  return undefined;
}

export interface DeterministicCommandOptions {
  command: string;
  terminateWithEnter?: boolean;
  clearLine?: boolean;
  user?: number;
  targetAddress?: string;
  targetPort?: number;
  dry_run?: boolean;
}

export async function sendDeterministicCommand(options: DeterministicCommandOptions): Promise<ToolExecutionResult> {
  const client = getOscClient();
  const command = ensureTerminator(options.command, options.terminateWithEnter);
  const shouldClear = options.clearLine !== false;
  const user = resolveUserId(options.user);

  if (options.dry_run) {
    return createDryRunResult({
      text: `Commande simulee: ${command}`,
      action: shouldClear ? 'new_command' : 'command',
      request: { command, clearLine: shouldClear, user: user ?? null },
      oscAddress: shouldClear ? oscMappings.commands.newCommand : oscMappings.commands.command,
      oscArgs: buildOscDescriptor(command, user ?? null).args,
      cli: { text: command }
    });
  }

  if (shouldClear) {
    await client.sendNewCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    return formatSendResult(command, user ?? null, oscMappings.commands.newCommand);
  }

  await client.sendCommand(command, {
    user,
    targetAddress: options.targetAddress,
    targetPort: options.targetPort
  });

  return formatSendResult(command, user ?? null, oscMappings.commands.command);
}

const commandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  terminateWithEnter: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_command
 * @summary Commande EOS
 * @description Envoie du texte sur la ligne de commande existante de la console. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.
 * @arguments Voir docs/tools.md#eos-command pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-command pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-command pour un exemple OSC.
 */
export const eosCommandTool: ToolDefinition<typeof commandInputSchema> = {
  name: 'eos_command',
  config: {
    title: 'Commande EOS',
    description:
      'Envoie du texte sur la ligne de commande existante de la console. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.',
    inputSchema: commandInputSchema,
    annotations: {
      ...mappingAnnotations(oscMappings.commands.command, 'command_line'),
      recommendedUsage: cueProgrammingGuardrails
    }
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const command = ensureTerminator(options.command, options.terminateWithEnter);

    const user = resolveUserId(options.user);

    if (options.dry_run) {
      return createDryRunResult({
        text: `Commande simulee: ${command}`,
        action: 'command',
        request: { command, user: user ?? null },
        oscAddress: oscMappings.commands.command,
        oscArgs: buildOscDescriptor(command, user ?? null).args,
        cli: { text: command }
      });
    }

    if (isSensitiveCommandText(command)) {
      assertSensitiveActionAllowed(options, 'eos_command');
    }

    await client.sendCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatSendResult(command, user ?? null, oscMappings.commands.command);
  }
};

const newCommandInputSchema = {
  command: z.string().min(1, 'La commande ne peut pas etre vide'),
  substitutions: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  clearLine: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_new_command
 * @summary Nouvelle commande EOS
 * @description Efface optionnellement la ligne de commande puis envoie le texte fourni. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.
 * @arguments Voir docs/tools.md#eos-new-command pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-new-command pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-new-command pour un exemple OSC.
 */
export const eosNewCommandTool: ToolDefinition<typeof newCommandInputSchema> = {
  name: 'eos_new_command',
  config: {
    title: 'Nouvelle commande EOS',
    description:
      'Efface optionnellement la ligne de commande puis envoie le texte fourni. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.',
    inputSchema: newCommandInputSchema,
    annotations: {
      ...mappingAnnotations(oscMappings.commands.newCommand, 'command_line_new'),
      recommendedUsage: cueProgrammingGuardrails
    }
  },
  handler: async (args, _extra) => {
    const schema = z.object(newCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const substituted = applySubstitutions(options.command, options.substitutions ?? []);
    if (!options.dry_run && isSensitiveCommandText(substituted)) {
      assertSensitiveActionAllowed(options, 'eos_new_command');
    }
    return sendDeterministicCommand({
      command: substituted,
      terminateWithEnter: options.terminateWithEnter,
      clearLine: options.clearLine,
      user: options.user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      dry_run: options.dry_run
    });
  }
};

const substitutionCommandInputSchema = {
  template: z.string().min(1, 'Le gabarit ne peut pas etre vide'),
  values: substitutionsSchema,
  terminateWithEnter: z.boolean().optional(),
  user: z.coerce.number().int().min(0).optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_command_with_substitution
 * @summary Commande avec substitution
 * @description Applique des substitutions %1, %2, ... puis envoie la commande.
 * @arguments Voir docs/tools.md#eos-command-with-substitution pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-command-with-substitution pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-command-with-substitution pour un exemple OSC.
 */
export const eosCommandWithSubstitutionTool: ToolDefinition<typeof substitutionCommandInputSchema> = {
  name: 'eos_command_with_substitution',
  config: {
    title: 'Commande avec substitution',
    description: 'Applique des substitutions %1, %2, ... puis envoie la commande.',
    inputSchema: substitutionCommandInputSchema,
    annotations: mappingAnnotations(oscMappings.commands.command, 'command_line_template')
  },
  handler: async (args, _extra) => {
    const schema = z.object(substitutionCommandInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const substituted = applySubstitutions(options.template, options.values ?? []);
    const command = ensureTerminator(substituted, options.terminateWithEnter);

    const user = resolveUserId(options.user);

    if (options.dry_run) {
      return createDryRunResult({
        text: `Commande simulee: ${command}`,
        action: 'command',
        request: { command, user: user ?? null },
        oscAddress: oscMappings.commands.command,
        oscArgs: buildOscDescriptor(command, user ?? null).args,
        cli: { text: command }
      });
    }

    if (isSensitiveCommandText(command)) {
      assertSensitiveActionAllowed(options, 'eos_command_with_substitution');
    }

    await client.sendCommand(command, {
      user,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return formatSendResult(command, user ?? null, oscMappings.commands.command);
  }
};

const commandLineInputSchema = {
  user: z.coerce.number().int().min(0).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  ...targetOptionsSchema
};

/**
 * @tool eos_get_command_line
 * @summary Lecture de la ligne de commande EOS
 * @description Recupere le contenu courant de la ligne de commande via OSC Get.
 * @arguments Voir docs/tools.md#eos-get-command-line pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-command-line pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-command-line pour un exemple OSC.
 */
export const eosGetCommandLineTool: ToolDefinition<typeof commandLineInputSchema> = {
  name: 'eos_get_command_line',
  config: {
    title: 'Lecture de la ligne de commande EOS',
    description: 'Recupere le contenu courant de la ligne de commande via OSC Get.',
    inputSchema: commandLineInputSchema,
    annotations: mappingAnnotations(oscMappings.commands.getCommandLine, 'command_line_query')
  },
  handler: async (args, _extra) => {
    const schema = z.object(commandLineInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const user = resolveUserId(options.user);
    if (options.dry_run) {
      return createDryRunResult({
        text: `Lecture ligne de commande simulee pour utilisateur ${user ?? 'global'}`,
        action: 'get_command_line',
        request: { user: user ?? null },
        oscAddress: oscMappings.commands.getCommandLine,
        oscArgs: { user: user ?? null }
      });
    }

    const result = await client.getCommandLine({
      user,
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
