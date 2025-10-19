import eosConnectTool from './connection/eos_connect.js';
import eosPingTool from './connection/eos_ping.js';
import eosResetTool from './connection/eos_reset.js';
import eosSubscribeTool from './connection/eos_subscribe.js';
import commandTools from './commands/command_tools.js';
import channelTools from './channels/index.js';
import groupTools from './groups/index.js';
import pingTool from './ping.js';
import type { ToolDefinition } from './types.js';

export const toolDefinitions: ToolDefinition[] = [
  pingTool,
  eosConnectTool,
  eosPingTool,
  eosResetTool,
  eosSubscribeTool,
  ...commandTools,
  ...channelTools,
  ...groupTools
];

export default toolDefinitions;
