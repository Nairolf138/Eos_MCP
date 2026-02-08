import eosConnectTool from './connection/eos_connect';
import eosConfigureTool from './connection/eos_configure';
import eosPingTool from './connection/eos_ping';
import eosResetTool from './connection/eos_reset';
import eosSubscribeTool from './connection/eos_subscribe';
import commandTools from './commands/command_tools';
import channelTools from './channels/index';
import groupTools from './groups/index';
import pingTool from './ping';
import eosCapabilitiesGetTool from './capabilities';
import diagnosticsTools from './diagnostics/index';
import cueTools from './cues/index';
import paletteTools from './palettes/index';
import presetTools from './presets/index';
import submasterTools from './submasters/index';
import faderTools from './faders/index';
import macroTools from './macros/index';
import effectTools from './effects/index';
import parameterTools from './parameters/index';
import keyTools from './keys/index';
import directSelectTools from './directSelects/index';
import magicSheetTools from './magicSheets/index';
import pixelMapTools from './pixelMaps/index';
import snapshotTools from './snapshots/index';
import curveTools from './curves/index';
import patchTools from './patch/index';
import fixtureTools from './fixtures/index';
import showControlTools from './showControl/index';
import queryTools from './queries/index';
import fpeTools from './fpe/index';
import dmxTools from './dmx/index';
import sessionTools from './session/index';
import programmingTools from './programming/index';
import workflowTools from './workflows/index';
import type { ToolDefinition } from './types';

const definitions = [
  eosCapabilitiesGetTool,
  pingTool,
  eosConnectTool,
  eosConfigureTool,
  eosPingTool,
  eosResetTool,
  eosSubscribeTool,
  ...commandTools,
  ...channelTools,
  ...groupTools,
  ...diagnosticsTools,
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
  ...fixtureTools,
  ...patchTools,
  ...snapshotTools,
  ...showControlTools,
  ...queryTools,
  ...fpeTools,
  ...dmxTools,
  ...sessionTools,
  ...programmingTools,
  ...workflowTools
];

export const toolDefinitions = definitions as ToolDefinition[];

export default toolDefinitions;
