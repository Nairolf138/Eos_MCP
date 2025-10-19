import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const timeoutSchema = z
  .number()
  .int()
  .min(50)
  .max(10000)
  .optional()
  .describe('Delai maximum d\'attente en millisecondes.');

function extractTargetOptions(options: { targetAddress?: string; targetPort?: number }): {
  targetAddress?: string;
  targetPort?: number;
} {
  const target: { targetAddress?: string; targetPort?: number } = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
}

function createResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
    ]
  } as ToolExecutionResult;
}

function normaliseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.show,
      record.show_name,
      record.name,
      record.title,
      record.label,
      record.value,
      record.text
    ];

    for (const candidate of candidates) {
      const normalised = normaliseString(candidate);
      if (normalised) {
        return normalised;
      }
    }
  }

  return null;
}

type LiveBlindState = {
  numeric: 0 | 1;
  label: 'Live' | 'Blind';
};

function extractStateValue(data: unknown): unknown {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }
    if (data.length === 1) {
      return extractStateValue(data[0]);
    }
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidates = [
      record.state,
      record.mode,
      record.live,
      record.value,
      record.status,
      record.result,
      record.active
    ];

    for (const candidate of candidates) {
      const value = extractStateValue(candidate);
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  return data;
}

function parseLiveBlindState(data: unknown): LiveBlindState {
  const value = extractStateValue(data);

  const normaliseFromString = (input: string): LiveBlindState | null => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'live' || trimmed === '1') {
      return { numeric: 1, label: 'Live' };
    }
    if (trimmed === 'blind' || trimmed === '0') {
      return { numeric: 0, label: 'Blind' };
    }
    return null;
  };

  if (typeof value === 'number') {
    if (value === 1) {
      return { numeric: 1, label: 'Live' };
    }
    if (value === 0) {
      return { numeric: 0, label: 'Blind' };
    }
  }

  if (typeof value === 'boolean') {
    return value ? { numeric: 1, label: 'Live' } : { numeric: 0, label: 'Blind' };
  }

  if (typeof value === 'string') {
    const parsed = normaliseFromString(value);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error(`Etat Live/Blind invalide: ${value ?? 'indetermine'}`);
}

function createFormatStringSchema(allowedPlaceholders: number[], description: string) {
  const allowedSet = new Set(allowedPlaceholders.map((placeholder) => placeholder.toString()));
  const placeholderList = allowedPlaceholders.map((value) => `%${value}`).join(', ');

  return z
    .string()
    .min(1, 'Le format doit contenir au moins un caractere.')
    .max(256, 'Le format est limite a 256 caracteres.')
    .describe(description)
    .superRefine((value, ctx) => {
      const matches = value.match(/%(\d)/g) ?? [];

      if (matches.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le format doit contenir au moins un placeholder valide (${placeholderList}).`
        });
        return;
      }

      for (const match of matches) {
        const digit = match.replace('%', '');
        if (!allowedSet.has(digit)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Placeholder ${match} invalide. Utilisez uniquement (${placeholderList}).`
          });
          return;
        }
      }
    });
}

const getShowNameInputSchema = {
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getLiveBlindStateInputSchema = {
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setCueSendStringInputSchema = {
  format_string: createFormatStringSchema(
    [1, 2, 3, 4, 5],
    'Format d\'envoi des cues (placeholders %1-%5 disponibles).'
  ),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setCueReceiveStringInputSchema = {
  format_string: createFormatStringSchema(
    [1, 2],
    'Format de reception des cues (placeholders %1-%2 disponibles).'
  ),
  ...targetOptionsSchema
} satisfies ZodRawShape;

export const eosGetShowNameTool: ToolDefinition<typeof getShowNameInputSchema> = {
  name: 'eos_get_show_name',
  config: {
    title: 'Nom du show',
    description: 'Recupere le nom du show actuellement charge sur la console.',
    inputSchema: getShowNameInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.showControl.showName
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getShowNameInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response: OscJsonResponse = await client.requestJson(oscMappings.showControl.showName, {
      timeoutMs: options.timeoutMs,
      ...extractTargetOptions(options)
    });

    const showName = normaliseString(response.data);

    if (!showName) {
      return createResult('Nom du show introuvable.', {
        action: 'get_show_name',
        status: response.status,
        show_name: null,
        osc: {
          address: oscMappings.showControl.showName,
          response: response.payload
        }
      });
    }

    return createResult(`Nom du show : "${showName}".`, {
      action: 'get_show_name',
      status: response.status,
      show_name: showName,
      osc: {
        address: oscMappings.showControl.showName,
        response: response.payload
      }
    });
  }
};

export const eosGetLiveBlindStateTool: ToolDefinition<typeof getLiveBlindStateInputSchema> = {
  name: 'eos_get_live_blind_state',
  config: {
    title: 'Etat Live/Blind',
    description: 'Indique si la console est en mode Live ou Blind.',
    inputSchema: getLiveBlindStateInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.showControl.liveBlindState
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getLiveBlindStateInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response: OscJsonResponse = await client.requestJson(oscMappings.showControl.liveBlindState, {
      timeoutMs: options.timeoutMs,
      ...extractTargetOptions(options)
    });

    try {
      const state = parseLiveBlindState(response.data);
      const text = state.numeric === 1 ? 'Console en mode Live.' : 'Console en mode Blind.';
      return createResult(text, {
        action: 'get_live_blind_state',
        status: response.status,
        state,
        osc: {
          address: oscMappings.showControl.liveBlindState,
          response: response.payload
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Etat Live/Blind non reconnu renvoye par la console.';

      return createResult(message, {
        action: 'get_live_blind_state',
        status: response.status,
        error: message,
        osc: {
          address: oscMappings.showControl.liveBlindState,
          response: response.payload
        }
      });
    }
  }
};

export const eosToggleStagingModeTool: ToolDefinition<typeof targetOptionsSchema> = {
  name: 'eos_toggle_staging_mode',
  config: {
    title: 'Toggle Staging Mode',
    description: 'Active ou desactive le mode Staging de la console.',
    inputSchema: targetOptionsSchema,
    annotations: {
      mapping: {
        osc: oscMappings.showControl.toggleStagingMode
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(targetOptionsSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response: OscJsonResponse = await client.requestJson(
      oscMappings.showControl.toggleStagingMode,
      extractTargetOptions(options)
    );

    return createResult('Mode staging bascule.', {
      action: 'toggle_staging_mode',
      status: response.status,
      osc: {
        address: oscMappings.showControl.toggleStagingMode,
        response: response.payload
      }
    });
  }
};

export const eosSetCueSendStringTool: ToolDefinition<typeof setCueSendStringInputSchema> = {
  name: 'eos_set_cue_send_string',
  config: {
    title: 'Format d\'envoi des cues',
    description: 'Configure le format d\'envoi OSC des cues (placeholders %1-%5).',
    inputSchema: setCueSendStringInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.showControl.setCueSendString
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(setCueSendStringInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = { format: options.format_string };

    const response: OscJsonResponse = await client.requestJson(oscMappings.showControl.setCueSendString, {
      payload,
      ...extractTargetOptions(options)
    });

    return createResult('Format d\'envoi des cues mis a jour.', {
      action: 'set_cue_send_string',
      status: response.status,
      format: options.format_string,
      osc: {
        address: oscMappings.showControl.setCueSendString,
        request: payload,
        response: response.payload
      }
    });
  }
};

export const eosSetCueReceiveStringTool: ToolDefinition<typeof setCueReceiveStringInputSchema> = {
  name: 'eos_set_cue_receive_string',
  config: {
    title: 'Format de reception des cues',
    description: 'Configure le format de reception OSC des cues (placeholders %1-%2).',
    inputSchema: setCueReceiveStringInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.showControl.setCueReceiveString
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(setCueReceiveStringInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = { format: options.format_string };

    const response: OscJsonResponse = await client.requestJson(oscMappings.showControl.setCueReceiveString, {
      payload,
      ...extractTargetOptions(options)
    });

    return createResult('Format de reception des cues mis a jour.', {
      action: 'set_cue_receive_string',
      status: response.status,
      format: options.format_string,
      osc: {
        address: oscMappings.showControl.setCueReceiveString,
        request: payload,
        response: response.payload
      }
    });
  }
};

export const showControlTools = [
  eosGetShowNameTool,
  eosGetLiveBlindStateTool,
  eosToggleStagingModeTool,
  eosSetCueSendStringTool,
  eosSetCueReceiveStringTool
];

export default showControlTools;

