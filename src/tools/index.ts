import eosConnectTool from './connection/eos_connect.js';
import eosPingTool from './connection/eos_ping.js';
import eosResetTool from './connection/eos_reset.js';
import eosSubscribeTool from './connection/eos_subscribe.js';
import pingTool from './ping.js';
import type { ToolDefinition } from './types.js';

export const toolDefinitions: ToolDefinition[] = [
  pingTool,
  eosConnectTool,
  eosPingTool,
  eosResetTool,
  eosSubscribeTool
];

export default toolDefinitions;
