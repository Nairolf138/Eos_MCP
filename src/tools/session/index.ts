import { z } from 'zod';
import { getResourceCache } from '../../services/cache';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

let currentUserId: number | null = null;

const SESSION_CONTEXT_CACHE_KEY = 'current_context';
const DEFAULT_CONTEXT_TTL_MS = 10 * 60 * 1000;

const sessionContextSchema = z
  .object({
    show: z.string().min(1).nullable().optional(),
    active_cuelist: z.union([z.string().min(1), z.number().int().min(0)]).nullable().optional(),
    selected_channels: z.array(z.coerce.number().int().min(1)).optional(),
    selected_groups: z.array(z.coerce.number().int().min(1)).optional(),
    recent_palettes: z
      .array(
        z.object({
          type: z.string().min(1).optional(),
          id: z.coerce.number().int().min(0),
          label: z.string().min(1).optional()
        })
      )
      .optional()
  })
  .strict();

export type SessionContext = z.infer<typeof sessionContextSchema>;

export function setCurrentUserId(userId: number | null): void {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId >= 0) {
    currentUserId = Math.trunc(userId);
    return;
  }

  currentUserId = null;
}

export function getCurrentUserId(): number | null {
  return currentUserId;
}

export function clearCurrentUserId(): void {
  currentUserId = null;
}

async function setSessionContext(context: SessionContext, ttlMs = DEFAULT_CONTEXT_TTL_MS): Promise<void> {
  const cache = getResourceCache();
  cache.invalidateEntry('session', SESSION_CONTEXT_CACHE_KEY);
  await cache.fetch<SessionContext>({
    resourceType: 'session',
    key: SESSION_CONTEXT_CACHE_KEY,
    ttlMs,
    fetcher: async () => context
  });
}

async function getSessionContext(): Promise<SessionContext | null> {
  const cache = getResourceCache();
  return cache.fetch<SessionContext | null>({
    resourceType: 'session',
    key: SESSION_CONTEXT_CACHE_KEY,
    fetcher: async () => null
  });
}

export function clearSessionContext(): void {
  getResourceCache().invalidateEntry('session', SESSION_CONTEXT_CACHE_KEY);
}

function buildSuggestedNextActions(hasContext: boolean): Array<Record<string, string>> {
  if (hasContext) {
    return [
      {
        tool: 'session_get_context',
        reason: 'Verifier le contexte courant avant les prochains appels EOS sensibles.'
      },
      {
        tool: 'session_clear_context',
        reason: 'Reinitialiser le contexte si la selection est obsolete.'
      }
    ];
  }

  return [
    {
      tool: 'session_set_context',
      reason: 'Declarer le show, la cuelist active et les selections pour guider les appels suivants.'
    },
    {
      tool: 'session_set_current_user',
      reason: 'Definir un utilisateur courant avant les operations dependantes du contexte utilisateur.'
    }
  ];
}

const setCurrentUserInputSchema = {
  user: z.coerce.number().int().min(0, "L'identifiant utilisateur doit etre positif")
};

const setContextInputSchema = {
  context: sessionContextSchema,
  ttl_ms: z.coerce.number().int().min(1).max(24 * 60 * 60 * 1000).optional()
};

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
};

const setUserIdInputSchema = {
  user_id: z.coerce.number().int().min(0, "L'identifiant utilisateur doit etre positif"),
  ...targetOptionsSchema
};

const extractTargetOptions = (options: { targetAddress?: string; targetPort?: number }) => {
  const target: { targetAddress?: string; targetPort?: number } = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
};

const buildJsonArgs = (payload: Record<string, unknown>) => [
  {
    type: 's' as const,
    value: JSON.stringify(payload)
  }
];

/**
 * @tool session_set_current_user
 * @summary Definir utilisateur courant
 * @description Stocke en local le numero utilisateur EOS a utiliser par defaut.
 * @arguments Voir docs/tools.md#session-set-current-user pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#session-set-current-user pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#session-set-current-user pour un exemple OSC.
 */
export const sessionSetCurrentUserTool: ToolDefinition<typeof setCurrentUserInputSchema> = {
  name: 'session_set_current_user',
  config: {
    title: 'Definir utilisateur courant',
    description: 'Stocke en local le numero utilisateur EOS a utiliser par defaut.',
    inputSchema: setCurrentUserInputSchema
  },
  handler: async (args) => {
    const schema = z.object(setCurrentUserInputSchema).strict();
    const options = schema.parse(args ?? {});

    setCurrentUserId(options.user);

    return {
      content: [
        {
          type: 'text',
          text: `Utilisateur courant defini sur ${options.user}`
        }
      ],
      structuredContent: {
        user: options.user,
        suggested_next_actions: buildSuggestedNextActions(Boolean(await getSessionContext()))
      }
    } as ToolExecutionResult;
  }
};

/**
 * @tool session_get_current_user
 * @summary Utilisateur courant
 * @description Renvoie le numero utilisateur EOS memorise localement.
 * @arguments Voir docs/tools.md#session-get-current-user pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#session-get-current-user pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#session-get-current-user pour un exemple OSC.
 */
export const sessionGetCurrentUserTool: ToolDefinition = {
  name: 'session_get_current_user',
  config: {
    title: 'Utilisateur courant',
    description: 'Renvoie le numero utilisateur EOS memorise localement.'
  },
  handler: async () => {
    const user = getCurrentUserId();

    return {
      content: [
        {
          type: 'text',
          text: typeof user === 'number' ? `Utilisateur courant: ${user}` : 'Aucun utilisateur courant defini'
        }
      ],
      structuredContent: {
        user: user ?? null,
        suggested_next_actions: buildSuggestedNextActions(Boolean(await getSessionContext()))
      }
    } as ToolExecutionResult;
  }
};

/**
 * @tool eos_set_user_id
 * @summary Definir identifiant utilisateur EOS
 * @description Definit l'identifiant utilisateur actif sur la console EOS via OSC.
 * @arguments Voir docs/tools.md#eos-set-user-id pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-user-id pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-user-id pour un exemple OSC.
 */
export const eosSetUserIdTool: ToolDefinition<typeof setUserIdInputSchema> = {
  name: 'eos_set_user_id',
  config: {
    title: 'Definir identifiant utilisateur EOS',
    description: "Definit l'identifiant utilisateur actif sur la console EOS via OSC.",
    inputSchema: setUserIdInputSchema
  },
  handler: async (args) => {
    const schema = z.object(setUserIdInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = { user_id: options.user_id };
    const argsList = buildJsonArgs(payload);

    await client.sendMessage(oscMappings.system.setUserId, argsList, extractTargetOptions(options));
    setCurrentUserId(options.user_id);

    return {
      content: [
        {
          type: 'text',
          text: `Identifiant utilisateur EOS defini sur ${options.user_id}`
        }
      ],
      structuredContent: {
        action: 'set_user_id',
        user_id: options.user_id,
        session_user: options.user_id,
        osc: {
          address: oscMappings.system.setUserId,
          args: payload
        }
      }
    } as ToolExecutionResult;
  }
};

/**
 * @tool session_set_context
 * @summary Definir contexte courant
 * @description Stocke le contexte courant (show, cuelist active, selections canaux/groupes, palettes recentes) avec un TTL configurable.
 * @arguments Voir docs/tools.md#session-set-context pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#session-set-context pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#session-set-context pour un exemple OSC.
 */
export const sessionSetContextTool: ToolDefinition<typeof setContextInputSchema> = {
  name: 'session_set_context',
  config: {
    title: 'Definir contexte courant',
    description:
      'Stocke le contexte courant (show, cuelist active, selections canaux/groupes, palettes recentes) avec un TTL configurable.',
    inputSchema: setContextInputSchema
  },
  handler: async (args) => {
    const schema = z.object(setContextInputSchema).strict();
    const options = schema.parse(args ?? {});

    await setSessionContext(options.context, options.ttl_ms ?? DEFAULT_CONTEXT_TTL_MS);

    return {
      content: [
        {
          type: 'text',
          text: 'Contexte courant enregistre'
        }
      ],
      structuredContent: {
        context: options.context,
        ttl_ms: options.ttl_ms ?? DEFAULT_CONTEXT_TTL_MS,
        suggested_next_actions: buildSuggestedNextActions(true)
      }
    } as ToolExecutionResult;
  }
};

/**
 * @tool session_get_context
 * @summary Contexte courant
 * @description Renvoie le contexte courant memorise localement.
 * @arguments Voir docs/tools.md#session-get-context pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#session-get-context pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#session-get-context pour un exemple OSC.
 */
export const sessionGetContextTool: ToolDefinition = {
  name: 'session_get_context',
  config: {
    title: 'Contexte courant',
    description: 'Renvoie le contexte courant memorise localement.'
  },
  handler: async () => {
    const context = await getSessionContext();

    return {
      content: [
        {
          type: 'text',
          text: context ? 'Contexte courant disponible' : 'Aucun contexte courant defini'
        }
      ],
      structuredContent: {
        context,
        suggested_next_actions: buildSuggestedNextActions(Boolean(context))
      }
    } as ToolExecutionResult;
  }
};

/**
 * @tool session_clear_context
 * @summary Effacer contexte courant
 * @description Supprime le contexte courant memorise localement.
 * @arguments Voir docs/tools.md#session-clear-context pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#session-clear-context pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#session-clear-context pour un exemple OSC.
 */
export const sessionClearContextTool: ToolDefinition = {
  name: 'session_clear_context',
  config: {
    title: 'Effacer contexte courant',
    description: 'Supprime le contexte courant memorise localement.'
  },
  handler: async () => {
    clearSessionContext();

    return {
      content: [
        {
          type: 'text',
          text: 'Contexte courant efface'
        }
      ],
      structuredContent: {
        context: null,
        suggested_next_actions: buildSuggestedNextActions(false)
      }
    } as ToolExecutionResult;
  }
};

export const sessionTools = [
  eosSetUserIdTool,
  sessionSetCurrentUserTool,
  sessionGetCurrentUserTool,
  sessionSetContextTool,
  sessionGetContextTool,
  sessionClearContextTool
] as ToolDefinition[];

export default sessionTools;
