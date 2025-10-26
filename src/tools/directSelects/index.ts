import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

interface DirectSelectBankState {
  page: number;
  targetType: string;
  buttonCount: number;
  flexiMode: boolean;
}

interface DirectSelectTargetOptions {
  targetAddress?: string;
  targetPort?: number;
}

interface BankCreateOptions extends DirectSelectTargetOptions {
  bank_index: number;
  target_type: string;
  button_count: number;
  flexi_mode: boolean;
  page_number?: number;
}

interface PressOptions extends DirectSelectTargetOptions {
  bank_index: number;
  button_index: number;
  state: number;
}

interface PageOptions extends DirectSelectTargetOptions {
  bank_index: number;
  delta: number;
}

const TARGET_TYPE_LOOKUP: Record<string, string> = {
  chan: 'Chan',
  group: 'Group',
  macro: 'Macro',
  sub: 'Sub',
  preset: 'Preset',
  ip: 'IP',
  fp: 'FP',
  cp: 'CP',
  bp: 'BP',
  ms: 'MS',
  curve: 'Curve',
  snap: 'Snap',
  fx: 'FX',
  pixmap: 'Pixmap',
  scene: 'Scene'
};

const TARGET_TYPE_ERROR_MESSAGE = [
  'Type de cible invalide. Valeurs supportees:',
  'Chan, Group, Macro, Sub, Preset, IP, FP, CP, BP, MS, Curve, Snap, FX, Pixmap, Scene.'
].join(' ');

const bankStateCache = new Map<number, DirectSelectBankState>();

export function __resetDirectSelectBankCacheForTests(): void {
  bankStateCache.clear();
}

function getBankState(bankIndex: number): DirectSelectBankState {
  const existing = bankStateCache.get(bankIndex);
  if (existing) {
    return existing;
  }

  const state: DirectSelectBankState = {
    page: 0,
    targetType: 'Chan',
    buttonCount: 0,
    flexiMode: false
  };
  bankStateCache.set(bankIndex, state);
  return state;
}

function setBankState(bankIndex: number, state: DirectSelectBankState): void {
  bankStateCache.set(bankIndex, state);
}

function buildFloatArgs(value: number): OscMessageArgument[] {
  return [
    {
      type: 'f',
      value
    }
  ];
}

function extractTargetOptions(options: DirectSelectTargetOptions): DirectSelectTargetOptions {
  const target: DirectSelectTargetOptions = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
}

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function formatDirectSelectPath(
  pattern: string,
  values: Record<string, string | number>
): string {
  return pattern.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Valeur manquante pour le parametre ${match}`);
    }
    return String(values[key]);
  });
}

function normaliseTargetType(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const key = trimmed.toLowerCase();
  return TARGET_TYPE_LOOKUP[key] ?? null;
}

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const bankIndexSchema = z
  .number()
  .int()
  .min(0)
  .describe("Index du bank de direct selects (0 pour le premier bank).");

const buttonIndexSchema = z
  .number()
  .int()
  .min(1)
  .describe('Position du bouton dans le bank (1-n).');

const stateValueSchema = z
  .number()
  .finite()
  .min(0)
  .max(1)
  .describe('Etat du bouton (1.0 = enfonce, 0.0 = relache).');

const targetTypeSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const normalised = normaliseTargetType(value);
    if (!normalised) {
      ctx.addIssue({
        code: 'custom',
        message: TARGET_TYPE_ERROR_MESSAGE
      });
      return z.NEVER;
    }
    return normalised;
  });

const bankCreateInputSchema = {
  bank_index: bankIndexSchema,
  target_type: targetTypeSchema,
  button_count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe('Nombre de boutons a creer dans le bank (1-100).'),
  flexi_mode: z.boolean().describe('Active ou non le mode Flexi pour le bank.'),
  page_number: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Page initiale (0 par defaut).'),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const pressInputSchema = {
  bank_index: bankIndexSchema,
  button_index: buttonIndexSchema,
  state: stateValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const pageInputSchema = {
  bank_index: bankIndexSchema,
  delta: z.number().int(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const bankCreateSchema = z.object(bankCreateInputSchema).strict();

const pressSchema = z.object(pressInputSchema).strict();

const pageSchema = z.object(pageInputSchema).strict();

/**
 * @tool eos_direct_select_bank_create
 * @summary Creation de bank de direct selects
 * @description Cree un bank de direct selects OSC avec configuration de cible et pagination.
 * @arguments Voir docs/tools.md#eos-direct-select-bank-create pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-direct-select-bank-create pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-direct-select-bank-create pour un exemple OSC.
 */
export const eosDirectSelectBankCreateTool: ToolDefinition<typeof bankCreateInputSchema> = {
  name: 'eos_direct_select_bank_create',
  config: {
    title: 'Creation de bank de direct selects',
    description: 'Cree un bank de direct selects OSC avec configuration de cible et pagination.',
    inputSchema: bankCreateInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.directSelects.bankCreate
      }
    }
  },
  handler: async (args) => {
    const options: BankCreateOptions = bankCreateSchema.parse(args ?? {});
    const client = getOscClient();

    const state: DirectSelectBankState = {
      page: options.page_number ?? 0,
      targetType: options.target_type,
      buttonCount: options.button_count,
      flexiMode: options.flexi_mode
    };

    setBankState(options.bank_index, state);

    const address = formatDirectSelectPath(oscMappings.directSelects.bankCreate, {
      index: options.bank_index,
      target: state.targetType,
      buttons: state.buttonCount,
      flexi: state.flexiMode ? 1 : 0,
      page: state.page
    });

    await client.sendMessage(address, [], extractTargetOptions(options));

    const textParts = [
      `Bank ${options.bank_index} configure en ${options.target_type}`,
      `${options.button_count} boutons`,
      `Flexi ${options.flexi_mode ? 'active' : 'desactive'}`
    ];

    if (typeof options.page_number === 'number') {
      textParts.push(`page ${options.page_number}`);
    }

    return createResult(textParts.join(' - '), {
      action: 'direct_select_bank_create',
      bank: options.bank_index,
      page: state.page,
      targetType: state.targetType,
      buttonCount: state.buttonCount,
      flexiMode: state.flexiMode,
      request: {
        bank: options.bank_index,
        target: state.targetType,
        buttons: state.buttonCount,
        flexi: state.flexiMode,
        page: state.page
      },
      osc: {
        address,
        args: []
      }
    });
  }
};

/**
 * @tool eos_direct_select_press
 * @summary Appui de direct select
 * @description Simule un appui ou relachement sur un bouton de direct select.
 * @arguments Voir docs/tools.md#eos-direct-select-press pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-direct-select-press pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-direct-select-press pour un exemple OSC.
 */
export const eosDirectSelectPressTool: ToolDefinition<typeof pressInputSchema> = {
  name: 'eos_direct_select_press',
  config: {
    title: 'Appui de direct select',
    description: 'Simule un appui ou relachement sur un bouton de direct select.',
    inputSchema: pressInputSchema
  },
  handler: async (args) => {
    const options: PressOptions = pressSchema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);

    if (state.buttonCount > 0 && options.button_index > state.buttonCount) {
      throw new Error(
        `Le bouton ${options.button_index} depasse le nombre de boutons configure (${state.buttonCount}).`
      );
    }

    const address = formatDirectSelectPath(oscMappings.directSelects.base, {
      index: options.bank_index,
      page: state.page,
      button: options.button_index
    });
    const stateValue: number = options.state;

    await client.sendMessage(address, buildFloatArgs(stateValue), extractTargetOptions(options));

    const actionText = stateValue >= 1 ? 'enfonce' : stateValue <= 0 ? 'relache' : `etat ${stateValue}`;
    const text = `Bank ${options.bank_index} page ${state.page}: bouton ${options.button_index} ${actionText}.`;

    return createResult(text, {
      action: 'direct_select_press',
      bank: options.bank_index,
      page: state.page,
      button: options.button_index,
      buttonCount: state.buttonCount,
      targetType: state.targetType,
      flexiMode: state.flexiMode,
      state: stateValue,
      osc: {
        address,
        args: stateValue
      }
    });
  }
};

/**
 * @tool eos_direct_select_page
 * @summary Navigation de direct select
 * @description Change la page active dans un bank de direct selects.
 * @arguments Voir docs/tools.md#eos-direct-select-page pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-direct-select-page pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-direct-select-page pour un exemple OSC.
 */
export const eosDirectSelectPageTool: ToolDefinition<typeof pageInputSchema> = {
  name: 'eos_direct_select_page',
  config: {
    title: 'Navigation de direct select',
    description: 'Change la page active dans un bank de direct selects.',
    inputSchema: pageInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.directSelects.bankPage
      }
    }
  },
  handler: async (args) => {
    const options: PageOptions = pageSchema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);
    const previousPage = state.page;

    const address = formatDirectSelectPath(oscMappings.directSelects.bankPage, {
      index: options.bank_index,
      delta: options.delta
    });

    await client.sendMessage(address, [], extractTargetOptions(options));

    const nextPage = Math.max(0, previousPage + options.delta);
    state.page = nextPage;

      return createResult(
      `Bank ${options.bank_index}: passage de la page ${previousPage} a ${nextPage}.`,
      {
        action: 'direct_select_bank_page',
        bank: options.bank_index,
        previousPage,
        page: nextPage,
        targetType: state.targetType,
        buttonCount: state.buttonCount,
        flexiMode: state.flexiMode,
        request: {
          bank: options.bank_index,
          delta: options.delta
        },
        osc: {
          address,
          args: []
        }
      }
    );
  }
};

const directSelectTools = [
  eosDirectSelectBankCreateTool,
  eosDirectSelectPressTool,
  eosDirectSelectPageTool
];

export default directSelectTools;
