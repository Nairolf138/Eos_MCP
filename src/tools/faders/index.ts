import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

interface FaderBankState {
  page: number;
  faderCount: number;
}

const LEVEL_KEYWORDS: Record<string, number> = {
  full: 1,
  out: 0
};

const bankStateCache = new Map<number, FaderBankState>();

export function __resetFaderBankCacheForTests(): void {
  bankStateCache.clear();
}

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const bankIndexSchema = z
  .number()
  .int()
  .min(0)
  .describe('Index du bank de faders (0 = Main, 1 = Mains, etc.).');

const faderIndexSchema = z
  .number()
  .int()
  .min(1)
  .describe('Position du fader dans le bank (1-n).');

const levelValueSchema = z.union([z.number(), z.string().min(1)]);

const bankCreateInputSchema = {
  bank_index: bankIndexSchema,
  fader_count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe('Nombre de faders a creer dans le bank.'),
  page_number: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Numero de page initial (0 par defaut).'),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setLevelInputSchema = {
  bank_index: bankIndexSchema,
  fader_index: faderIndexSchema,
  level: levelValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const loadInputSchema = {
  bank_index: bankIndexSchema,
  fader_index: faderIndexSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const pageInputSchema = {
  bank_index: bankIndexSchema,
  delta: z.number().int(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

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

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
}

function buildFloatArgs(value: number): OscMessageArgument[] {
  return [
    {
      type: 'f',
      value
    }
  ];
}

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const normalised = withoutPercent.replace(',', '.');
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveLevelValue(value: number | string): number {
  let numeric: number | null = null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Le niveau doit etre un nombre fini.');
    }
    numeric = value;
  } else {
    const lowered = value.trim().toLowerCase();
    if (lowered in LEVEL_KEYWORDS) {
      numeric = LEVEL_KEYWORDS[lowered];
    } else {
      numeric = toNumber(value);
    }
  }

  if (numeric == null) {
    throw new Error("Impossible d'interpreter la valeur de niveau.");
  }

  if (numeric > 1) {
    if (numeric > 100) {
      throw new Error('Le niveau ne peut pas exceder 100%.');
    }
    numeric = numeric / 100;
  }

  if (numeric < 0 || numeric > 1) {
    throw new Error('Le niveau doit etre compris entre 0 et 1 (ou 0% et 100%).');
  }

  return numeric;
}

function getBankState(bankIndex: number): FaderBankState {
  const existing = bankStateCache.get(bankIndex);
  if (existing) {
    return existing;
  }
  const state: FaderBankState = { page: 0, faderCount: 0 };
  bankStateCache.set(bankIndex, state);
  return state;
}

function setBankState(bankIndex: number, state: FaderBankState): void {
  bankStateCache.set(bankIndex, state);
}

function formatPercent(level: number): string {
  const percent = level * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

/**
 * @tool eos_fader_bank_create
 * @summary Creation de bank de faders
 * @description Cree un bank de faders OSC avec pagination optionnelle.
 * @arguments Voir docs/tools.md#eos-fader-bank-create pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fader-bank-create pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fader-bank-create pour un exemple OSC.
 */
export const eosFaderBankCreateTool: ToolDefinition<typeof bankCreateInputSchema> = {
  name: 'eos_fader_bank_create',
  config: {
    title: 'Creation de bank de faders',
    description: 'Cree un bank de faders OSC avec pagination optionnelle.',
    inputSchema: bankCreateInputSchema,
    annotations: annotate(oscMappings.faders.bankCreate)
  },
  handler: async (args, _extra) => {
    const schema = z.object(bankCreateInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const page = options.page_number ?? 0;
    const address = `${oscMappings.faders.base}/${options.bank_index}/config/${options.fader_count}/${page}`;

    await client.sendMessage(address, [], extractTargetOptions(options));

    setBankState(options.bank_index, { page, faderCount: options.fader_count });

    return createResult(`Bank ${options.bank_index} initialise avec ${options.fader_count} faders (page ${page}).`, {
      action: 'fader_bank_create',
      bank: options.bank_index,
      faders: options.fader_count,
      page,
      osc: {
        address,
        args: []
      }
    });
  }
};

/**
 * @tool eos_fader_set_level
 * @summary Reglage de niveau de fader
 * @description Definit le niveau (0-1 ou 0-100%) du fader cible.
 * @arguments Voir docs/tools.md#eos-fader-set-level pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fader-set-level pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fader-set-level pour un exemple OSC.
 */
export const eosFaderSetLevelTool: ToolDefinition<typeof setLevelInputSchema> = {
  name: 'eos_fader_set_level',
  config: {
    title: 'Reglage de niveau de fader',
    description: 'Definit le niveau (0-1 ou 0-100%) du fader cible.',
    inputSchema: setLevelInputSchema,
    annotations: annotate(`${oscMappings.faders.base}/{bank}/{page}/{fader}`)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setLevelInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);
    const level = resolveLevelValue(options.level);
    const address = `${oscMappings.faders.base}/${options.bank_index}/${state.page}/${options.fader_index}`;

    await client.sendMessage(address, buildFloatArgs(level), extractTargetOptions(options));

    return createResult(
      `Fader ${options.bank_index}.${state.page}.${options.fader_index} regle a ${formatPercent(level)}.`,
      {
        action: 'fader_set_level',
        bank: options.bank_index,
        page: state.page,
        fader: options.fader_index,
        level,
        osc: {
          address,
          args: [{ type: 'f', value: level }]
        }
      }
    );
  }
};

/**
 * @tool eos_fader_load
 * @summary Chargement de fader
 * @description Charge le contenu courant sur le fader specifie.
 * @arguments Voir docs/tools.md#eos-fader-load pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fader-load pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fader-load pour un exemple OSC.
 */
export const eosFaderLoadTool: ToolDefinition<typeof loadInputSchema> = {
  name: 'eos_fader_load',
  config: {
    title: 'Chargement de fader',
    description: 'Charge le contenu courant sur le fader specifie.',
    inputSchema: loadInputSchema,
    annotations: annotate(`${oscMappings.faders.base}/{bank}/{page}/{fader}/load`)
  },
  handler: async (args, _extra) => {
    const schema = z.object(loadInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);
    const address = `${oscMappings.faders.base}/${options.bank_index}/${state.page}/${options.fader_index}/load`;

    await client.sendMessage(address, [], extractTargetOptions(options));

    return createResult(
      `Fader ${options.bank_index}.${state.page}.${options.fader_index} charge.`,
      {
        action: 'fader_load',
        bank: options.bank_index,
        page: state.page,
        fader: options.fader_index,
        osc: {
          address,
          args: []
        }
      }
    );
  }
};

/**
 * @tool eos_fader_unload
 * @summary Dechargement de fader
 * @description Decharge le contenu du fader specifie.
 * @arguments Voir docs/tools.md#eos-fader-unload pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fader-unload pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fader-unload pour un exemple OSC.
 */
export const eosFaderUnloadTool: ToolDefinition<typeof loadInputSchema> = {
  name: 'eos_fader_unload',
  config: {
    title: 'Dechargement de fader',
    description: 'Decharge le contenu du fader specifie.',
    inputSchema: loadInputSchema,
    annotations: annotate(`${oscMappings.faders.base}/{bank}/{page}/{fader}/unload`)
  },
  handler: async (args, _extra) => {
    const schema = z.object(loadInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);
    const address = `${oscMappings.faders.base}/${options.bank_index}/${state.page}/${options.fader_index}/unload`;

    await client.sendMessage(address, [], extractTargetOptions(options));

    return createResult(
      `Fader ${options.bank_index}.${state.page}.${options.fader_index} decharge.`,
      {
        action: 'fader_unload',
        bank: options.bank_index,
        page: state.page,
        fader: options.fader_index,
        osc: {
          address,
          args: []
        }
      }
    );
  }
};

/**
 * @tool eos_fader_page
 * @summary Navigation de bank de faders
 * @description Change de page dans le bank en ajoutant le delta specifie.
 * @arguments Voir docs/tools.md#eos-fader-page pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fader-page pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fader-page pour un exemple OSC.
 */
export const eosFaderPageTool: ToolDefinition<typeof pageInputSchema> = {
  name: 'eos_fader_page',
  config: {
    title: 'Navigation de bank de faders',
    description: 'Change de page dans le bank en ajoutant le delta specifie.',
    inputSchema: pageInputSchema,
    annotations: annotate(oscMappings.faders.bankPage)
  },
  handler: async (args, _extra) => {
    const schema = z.object(pageInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = getBankState(options.bank_index);
    const previousPage = state.page;
    const address = `${oscMappings.faders.base}/${options.bank_index}/page/${options.delta}`;

    await client.sendMessage(address, [], extractTargetOptions(options));

    const nextPage = Math.max(0, previousPage + options.delta);
    state.page = nextPage;

    return createResult(
      `Bank ${options.bank_index}: passage de la page ${previousPage} a ${nextPage}.`,
      {
        action: 'fader_bank_page',
        bank: options.bank_index,
        previousPage,
        page: nextPage,
        osc: {
          address,
          args: []
        }
      }
    );
  }
};

const faderTools = [
  eosFaderBankCreateTool,
  eosFaderSetLevelTool,
  eosFaderLoadTool,
  eosFaderUnloadTool,
  eosFaderPageTool
];

export default faderTools;
