import { z } from 'zod';
import type { ToolDefinition, ToolExecutionResult } from '../types';

let currentUserId: number | null = null;

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

const setCurrentUserInputSchema = {
  user: z.coerce.number().int().min(0, "L'identifiant utilisateur doit etre positif")
};

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
        user: options.user
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
        user: user ?? null
      }
    } as ToolExecutionResult;
  }
};

export const sessionTools = [
  sessionSetCurrentUserTool,
  sessionGetCurrentUserTool
] as ToolDefinition[];

export default sessionTools;
