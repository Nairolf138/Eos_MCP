import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const buttonStateSchema = z.union([z.number().int().min(0).max(1), z.boolean()]).optional();

type ButtonStateInput = z.infer<typeof buttonStateSchema>;

const KEY_NAME_TO_OSC_ID = {
  go: 'go_0',
  stop_back: 'stop/back',
  stop: 'stop',
  pause: 'pause',
  back: 'back',
  record: 'record',
  update: 'update',
  live: 'live',
  blind: 'blind',
  home: 'home',
  out: 'out',
  full: 'full',
  sneak: 'sneak',
  group: 'group',
  cue: 'cue',
  label: 'label',
  delete: 'delete',
  enter: 'enter',
  clear_cmd: 'clear_cmd',
  select_last: 'select_last',
  select_next: 'select_next',
  page_up: 'page_up',
  page_down: 'page_down'
} as const;

type KeyName = keyof typeof KEY_NAME_TO_OSC_ID;

const keyNameSchema = z
  .string()
  .min(1, 'Le nom de touche est requis')
  .refine((value): value is KeyName => value in KEY_NAME_TO_OSC_ID, {
    message: 'Touche non prise en charge'
  });

function normaliseButtonState(value: ButtonStateInput): 0 | 1 {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value === 0 ? 0 : 1;
  }

  return 1;
}

function buildResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
    ]
  } as ToolExecutionResult;
}

function resolveKeyIdentifier(keyName: KeyName): string {
  return KEY_NAME_TO_OSC_ID[keyName];
}

function createOscArgs(state: 0 | 1): OscMessageArgument[] {
  return [
    {
      type: 'f',
      value: state
    }
  ];
}

const keyPressInputSchema = {
  key_name: keyNameSchema,
  state: buttonStateSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const softkeyPressInputSchema = {
  softkey_number: z
    .number()
    .int()
    .min(1, 'Le numero de softkey doit etre compris entre 1 et 12')
    .max(12, 'Le numero de softkey doit etre compris entre 1 et 12'),
  state: buttonStateSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const softkeyLabelsInputSchema = {
  timeoutMs: z.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

function normaliseSoftkeyLabels(data: unknown): Record<number, string> {
  const result: Record<number, string> = {};

  const assignFromRecord = (record: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(record)) {
      const index = Number.parseInt(key.replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(index) || index < 1 || index > 12) {
        continue;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        result[index] = value.trim();
      } else if (typeof value === 'number') {
        result[index] = String(value);
      }
    }
  };

  const assignFromArray = (items: unknown[]): void => {
    items.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const numberValue = record.softkey ?? record.number ?? record.index ?? record.id;
        const labelValue = record.label ?? record.text ?? record.value ?? record.name;
        const index = typeof numberValue === 'number' ? numberValue : Number.parseInt(String(numberValue ?? ''), 10);
        if (!Number.isFinite(index) || index < 1 || index > 12) {
          return;
        }
        if (typeof labelValue === 'string' && labelValue.trim().length > 0) {
          result[index] = labelValue.trim();
        } else if (typeof labelValue === 'number') {
          result[index] = String(labelValue);
        }
      }
    });
  };

  if (Array.isArray(data)) {
    assignFromArray(data);
    return result;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.labels)) {
      assignFromArray(record.labels);
    } else if (record.labels && typeof record.labels === 'object') {
      assignFromRecord(record.labels as Record<string, unknown>);
    }

    if (Array.isArray(record.softkeys)) {
      assignFromArray(record.softkeys);
    } else if (record.softkeys && typeof record.softkeys === 'object') {
      assignFromRecord(record.softkeys as Record<string, unknown>);
    }

    if (Object.keys(result).length === 0) {
      assignFromRecord(record);
    }
  }

  return result;
}

function buildSoftkeyLabelsResult(
  response: OscJsonResponse,
  labels: Record<number, string>
): ToolExecutionResult {
  const text =
    response.status === 'ok'
      ? `Libelles de softkeys recuperes (${Object.keys(labels).length} elements)`
      : `Reponse softkeys: ${response.status}`;

  return buildResult(text, {
    action: 'get_softkey_labels',
    status: response.status,
    labels,
    payload: response.data
  });
}

/**
 * @tool eos_key_press
 * @summary Appui sur touche
 * @description Simule l'appui ou le relachement d'une touche du clavier EOS.
 * @arguments Voir docs/tools.md#eos-key-press pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-key-press pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-key-press pour un exemple OSC.
 */
export const eosKeyPressTool: ToolDefinition<typeof keyPressInputSchema> = {
  name: 'eos_key_press',
  config: {
    title: 'Appui sur touche',
    description: 'Simule l\'appui ou le relachement d\'une touche du clavier EOS.',
    inputSchema: keyPressInputSchema,
    annotations: {
      mapping: {
        osc: '/eos/key/<key>'
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(keyPressInputSchema).strict();
    const options = schema.parse(args ?? {});
    const keyName = options.key_name as KeyName;
    const state = normaliseButtonState(options.state);
    const identifier = resolveKeyIdentifier(keyName);
    const address = `/eos/key/${identifier}`;
    const client = getOscClient();

    await client.sendMessage(address, createOscArgs(state), {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return buildResult(`Touche ${keyName} ${state === 1 ? 'enfoncee' : 'relachee'}`, {
      action: 'key_press',
      key_name: keyName,
      osc_identifier: identifier,
      state,
      osc: {
        address,
        args: createOscArgs(state)
      }
    });
  }
};

/**
 * @tool eos_softkey_press
 * @summary Appui sur softkey
 * @description Simule l'appui ou le relachement d'une softkey (1-12).
 * @arguments Voir docs/tools.md#eos-softkey-press pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-softkey-press pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-softkey-press pour un exemple OSC.
 */
export const eosSoftkeyPressTool: ToolDefinition<typeof softkeyPressInputSchema> = {
  name: 'eos_softkey_press',
  config: {
    title: 'Appui sur softkey',
    description: 'Simule l\'appui ou le relachement d\'une softkey (1-12).',
    inputSchema: softkeyPressInputSchema,
    annotations: {
      mapping: {
        osc: '/eos/key/softkey#'
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(softkeyPressInputSchema).strict();
    const options = schema.parse(args ?? {});
    const state = normaliseButtonState(options.state);
    const softkeyNumber = options.softkey_number;
    const address = `/eos/key/softkey${softkeyNumber}`;
    const client = getOscClient();

    await client.sendMessage(address, createOscArgs(state), {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return buildResult(`Softkey ${softkeyNumber} ${state === 1 ? 'enfoncee' : 'relachee'}`, {
      action: 'softkey_press',
      softkey_number: softkeyNumber,
      state,
      osc: {
        address,
        args: createOscArgs(state)
      }
    });
  }
};

/**
 * @tool eos_get_softkey_labels
 * @summary Libelles des softkeys
 * @description Recupere les libelles affiches des softkeys 1-12.
 * @arguments Voir docs/tools.md#eos-get-softkey-labels pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-softkey-labels pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-softkey-labels pour un exemple OSC.
 */
export const eosGetSoftkeyLabelsTool: ToolDefinition<typeof softkeyLabelsInputSchema> = {
  name: 'eos_get_softkey_labels',
  config: {
    title: 'Libelles des softkeys',
    description: 'Recupere les libelles affiches des softkeys 1-12.',
    inputSchema: softkeyLabelsInputSchema,
    annotations: {
      mapping: {
        osc: '/eos/get/softkey_labels'
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(softkeyLabelsInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response = await client.requestJson('/eos/get/softkey_labels', {
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const labels = normaliseSoftkeyLabels(response.data);

    return buildSoftkeyLabelsResult(response, labels);
  }
};

export const keyTools = [
  eosKeyPressTool,
  eosSoftkeyPressTool,
  eosGetSoftkeyLabelsTool
];

export const eosKeyTools = keyTools;

export default keyTools;
