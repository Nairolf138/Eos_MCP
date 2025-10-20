import eosConnectTool from './connection/eos_connect.js';
import eosPingTool from './connection/eos_ping.js';
import eosResetTool from './connection/eos_reset.js';
import eosSubscribeTool from './connection/eos_subscribe.js';
import commandTools from './commands/command_tools.js';
import channelTools from './channels/index.js';
import groupTools from './groups/index.js';
import pingTool from './ping.js';
import cueTools from './cues/index.js';
import paletteTools from './palettes/index.js';
import presetTools from './presets/index.js';
import submasterTools from './submasters/index.js';
import faderTools from './faders/index.js';
import macroTools from './macros/index.js';
import effectTools from './effects/index.js';
import parameterTools from './parameters/index.js';
import keyTools from './keys/index.js';
import directSelectTools from './directSelects/index.js';
import magicSheetTools from './magicSheets/index.js';
import pixelMapTools from './pixelMaps/index.js';
import snapshotTools from './snapshots/index.js';
import curveTools from './curves/index.js';
import patchTools from './patch/index.js';
import showControlTools from './showControl/index.js';
import queryTools from './queries/index.js';
import fpeTools from './fpe/index.js';
import dmxTools from './dmx/index.js';
import type { ToolDefinition } from './types.js';

export const toolDefinitions: ToolDefinition[] = [
  pingTool,
  eosConnectTool,
  eosPingTool,
  eosResetTool,
  eosSubscribeTool,
  ...commandTools,
  ...channelTools,
  ...groupTools,
  ...cueTools,
  ...paletteTools,
  ...presetTools,
  ...submasterTools,
  ...faderTools,
  ...macroTools,
  ...effectTools,
  ...parameterTools,
  ...keyTools,
  ...directSelectTools,
  ...magicSheetTools,
  ...pixelMapTools,
  ...curveTools,
  ...patchTools,
  ...snapshotTools,
  ...showControlTools,
  ...queryTools,
  ...fpeTools,
  ...dmxTools
];

export default toolDefinitions;
