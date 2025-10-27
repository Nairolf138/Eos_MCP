import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../toolRegistry';
import type { ToolDefinition, ToolExecutionResult, ToolMiddleware } from '../../tools/types';
import {
  sessionGetCurrentUserTool,
  setCurrentUserId,
  clearCurrentUserId
} from '../../tools/session/index';

const createMockServer = (): McpServer & {
  registerTool: jest.Mock;
  sendToolListChanged: jest.Mock;
} => {
  const registerTool = jest.fn();
  const sendToolListChanged = jest.fn();

  return {
    registerTool,
    sendToolListChanged
  } as unknown as McpServer & {
    registerTool: jest.Mock;
    sendToolListChanged: jest.Mock;
  };
};

describe('ToolRegistry schema-less tools', () => {
  it('invokes handlers with undefined args while preserving extra', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const handler = jest.fn(async (_args, extra): Promise<ToolExecutionResult> => {
      return {
        content: [
          {
            type: 'text',
            text: `extra:${JSON.stringify(extra)}`
          }
        ]
      };
    });

    const tool: ToolDefinition = {
      name: 'no_schema_tool',
      config: {
        description: 'A tool without an input schema'
      },
      handler
    };

    registry.register(tool);

    expect(server.registerTool).toHaveBeenCalledTimes(1);
    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    const extra = { requestId: 'without-schema' };
    const result = await (registeredHandler as RegisteredTestHandler)(extra);

    expect(handler).toHaveBeenCalledWith(undefined, extra);
    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: 'extra:{"requestId":"without-schema"}'
    });
  });

  it('provides middlewares with normalised args/extra', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);
    const contexts: Array<{ args: unknown; extra: unknown }> = [];

    const middleware: ToolMiddleware = async (context, next) => {
      contexts.push({ args: context.args, extra: context.extra });
      return next();
    };

    const handler = jest.fn(async (_args, _extra): Promise<ToolExecutionResult> => ({
      content: [{ type: 'text', text: 'middleware' }]
    }));

    const tool: ToolDefinition = {
      name: 'no_schema_with_middleware',
      config: {
        description: 'Schema-less tool using middlewares'
      },
      handler,
      middlewares: [middleware]
    };

    registry.register(tool);

    const [, , registeredHandler] = server.registerTool.mock.calls[0];
    const extra = { requestId: 'middleware-test' };
    await (registeredHandler as RegisteredTestHandler)(extra);

    expect(contexts).toEqual([
      {
        args: undefined,
        extra
      }
    ]);
    expect(handler).toHaveBeenCalledWith(undefined, extra);
  });

  it('executes session_get_current_user successfully', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const handler = jest.fn(sessionGetCurrentUserTool.handler);

    registry.register({
      ...sessionGetCurrentUserTool,
      handler
    });

    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    setCurrentUserId(42);
    const extra = { requestId: 'session-tool' };
    const result = await (registeredHandler as RegisteredTestHandler)(extra);

    expect(handler).toHaveBeenCalledWith(undefined, extra);
    expect(result.structuredContent).toEqual({ user: 42 });
    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: 'Utilisateur courant: 42'
    });
    clearCurrentUserId();
  });
});

type RegisteredTestHandler = (first: unknown, second?: unknown) => Promise<ToolExecutionResult>;
