import { z } from 'zod';
import { createLogger } from '../server/logger';
import type { ToolDefinition, ToolMiddleware } from './types';

const inputSchema = {
  message: z.string().optional()
};

const logger = createLogger('tool:ping');

const loggingMiddleware: ToolMiddleware = async (context, next) => {
  logger.debug({ tool: context.name }, `[MCP] Execution du tool ${context.name}`);
  return next();
};

/**
 * @tool ping
 * @summary Ping tool
 * @description Retourne un message de confirmation.
 * @arguments Voir docs/tools.md#ping pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#ping pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#ping pour un exemple OSC.
 */
export const pingTool: ToolDefinition<typeof inputSchema> = {
  name: 'ping',
  config: {
    title: 'Ping tool',
    description: 'Retourne un message de confirmation.',
    inputSchema
  },
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});
    const response = options.message ? `pong: ${options.message}` : 'pong';
    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  },
  middlewares: [loggingMiddleware]
};

export default pingTool;
