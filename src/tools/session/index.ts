/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { getRequestContext } from '../../server/requestContext';
import {
  getSessionContextStore,
  SESSION_CONTEXT_CLEANUP_RULES,
  type SessionContextPersistenceConfig
} from '../../services/cache/sessionContextStore';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

let currentUserId: number | null = null;

const SESSION_CONTEXT_KEY_PREFIX = 'session_context';
const DEFAULT_CONTEXT_TTL_MS = SESSION_CONTEXT_CLEANUP_RULES.defaultTtlMs;

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

type SessionContextIdentity = {
  key: string;
  source: 'context_id' | 'mcp_session_id' | 'agent_id' | 'user_id' | 'current_user' | 'default';
  id: string;
};

interface ContextIdentityInput {
  context_id?: string;
  mcp_session_id?: string;
  agent_id?: string;
  user_id?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normaliseContextId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

function buildSessionContextKey(source: SessionContextIdentity['source'], id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  return `${SESSION_CONTEXT_KEY_PREFIX}:${source}:${safeId}`;
}

function resolveSessionContextIdentity(
  args: ContextIdentityInput = {},
  extra: unknown = undefined
): SessionContextIdentity {
  const extraRecord = asRecord(extra);
  const requestContext = getRequestContext();
  const candidates: Array<[SessionContextIdentity['source'], unknown]> = [
    ['context_id', args.context_id],
    ['mcp_session_id', args.mcp_session_id],
    ['agent_id', args.agent_id],
    ['user_id', args.user_id],
    ['mcp_session_id', extraRecord.mcpSessionId],
    ['mcp_session_id', extraRecord.sessionId],
    ['agent_id', extraRecord.agentId],
    ['user_id', extraRecord.userId],
    ['mcp_session_id', requestContext?.sessionId],
    ['user_id', requestContext?.userId],
    ['current_user', currentUserId]
  ];

  for (const [source, candidate] of candidates) {
    const id = normaliseContextId(candidate);
    if (id) {
      return { source, id, key: buildSessionContextKey(source, id) };
    }
  }

  return { source: 'default', id: 'local', key: buildSessionContextKey('default', 'local') };
}

export function configureSessionContextPersistence(config: SessionContextPersistenceConfig<SessionContext>): void {
  getSessionContextStore().configure(config as SessionContextPersistenceConfig<unknown>);
}

async function setSessionContext(
  context: SessionContext,
  ttlMs = DEFAULT_CONTEXT_TTL_MS,
  identityInput: ContextIdentityInput = {},
  extra: unknown = undefined
): Promise<SessionContextIdentity> {
  const identity = resolveSessionContextIdentity(identityInput, extra);
  await getSessionContextStore().set(identity.key, context, ttlMs);
  return identity;
}

async function getSessionContext(
  identityInput: ContextIdentityInput = {},
  extra: unknown = undefined
): Promise<{ context: SessionContext | null; identity: SessionContextIdentity }> {
  const identity = resolveSessionContextIdentity(identityInput, extra);
  const entry = await getSessionContextStore().get(identity.key);
  return { context: (entry?.value as SessionContext | undefined) ?? null, identity };
}

export async function clearSessionContext(
  identityInput: ContextIdentityInput = {},
  extra: unknown = undefined
): Promise<void> {
  const identity = resolveSessionContextIdentity(identityInput, extra);
  await getSessionContextStore().delete(identity.key);
}

export async function clearAllSessionContexts(): Promise<void> {
  await getSessionContextStore().clearAll();
}

export async function cleanupExpiredSessionContexts(): Promise<number> {
  return getSessionContextStore().cleanupExpired();
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

const contextIdentityInputSchema = {
  context_id: z.string().min(1).optional(),
  mcp_session_id: z.string().min(1).optional(),
  agent_id: z.string().min(1).optional(),
  user_id: z.coerce.number().int().min(0).optional()
};

const setContextInputSchema = {
  context: sessionContextSchema,
  ttl_ms: z.coerce.number().int().min(1).max(SESSION_CONTEXT_CLEANUP_RULES.maxTtlMs).optional(),
  ...contextIdentityInputSchema
};

const contextLookupInputSchema = {
  ...contextIdentityInputSchema
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
        suggested_next_actions: buildSuggestedNextActions(Boolean((await getSessionContext({}, args)).context))
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
        suggested_next_actions: buildSuggestedNextActions(Boolean((await getSessionContext()).context))
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
  handler: async (args, extra) => {
    const schema = z.object(setContextInputSchema).strict();
    const options = schema.parse(args ?? {});
    const identity = await setSessionContext(options.context, options.ttl_ms ?? DEFAULT_CONTEXT_TTL_MS, options, extra);

    return {
      content: [
        {
          type: 'text',
          text: `Contexte enregistre pour ${identity.source}:${identity.id}`
        }
      ],
      structuredContent: {
        context: options.context,
        context_identity: identity,
        persistence: getSessionContextStore().getPersistenceMode(),
        expires_in_ms: options.ttl_ms ?? DEFAULT_CONTEXT_TTL_MS,
        ttl_ms: options.ttl_ms ?? DEFAULT_CONTEXT_TTL_MS,
        cleanup_rules: SESSION_CONTEXT_CLEANUP_RULES,
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
export const sessionGetContextTool: ToolDefinition<typeof contextLookupInputSchema> = {
  name: 'session_get_context',
  config: {
    title: 'Contexte courant',
    description: 'Renvoie le contexte courant memorise localement.',
    inputSchema: contextLookupInputSchema
  },
  handler: async (args, extra) => {
    const schema = z.object(contextLookupInputSchema).strict();
    const options = schema.parse(args ?? {});
    const { context, identity } = await getSessionContext(options, extra);

    return {
      content: [
        {
          type: 'text',
          text: context ? 'Contexte courant disponible' : 'Aucun contexte courant defini'
        }
      ],
      structuredContent: {
        context,
        context_identity: identity,
        persistence: getSessionContextStore().getPersistenceMode(),
        cleanup_rules: SESSION_CONTEXT_CLEANUP_RULES,
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
export const sessionClearContextTool: ToolDefinition<typeof contextLookupInputSchema> = {
  name: 'session_clear_context',
  config: {
    title: 'Effacer contexte courant',
    description: 'Supprime le contexte courant memorise localement.',
    inputSchema: contextLookupInputSchema
  },
  handler: async (args, extra) => {
    const schema = z.object(contextLookupInputSchema).strict();
    const options = schema.parse(args ?? {});
    const { identity } = await getSessionContext(options, extra);
    await clearSessionContext(options, extra);

    return {
      content: [
        {
          type: 'text',
          text: 'Contexte courant efface'
        }
      ],
      structuredContent: {
        context: null,
        context_identity: identity,
        persistence: getSessionContextStore().getPersistenceMode(),
        cleanup_rules: SESSION_CONTEXT_CLEANUP_RULES,
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
