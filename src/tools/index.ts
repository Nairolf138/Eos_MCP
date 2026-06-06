/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import eosConnectTool from './connection/eos_connect';
import eosConfigureTool from './connection/eos_configure';
import eosPingTool from './connection/eos_ping';
import eosResetTool from './connection/eos_reset';
import eosSubscribeTool from './connection/eos_subscribe';
import commandTools from './commands/index';
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
import showfileTools from './showfile/index';
import queryTools from './queries/index';
import fpeTools from './fpe/index';
import dmxTools from './dmx/index';
import sessionTools from './session/index';
import programmingTools from './programming/index';
import workflowTools from './workflows/index';
import { buildOscToolStrictModePolicy } from '../services/osc/messageBuilders';
import { classifyToolMetadata } from './common/classification';
import type { ToolDefinition } from './types';

const rawDefinitions = [
  eosCapabilitiesGetTool,
  pingTool,
  eosConnectTool,
  eosConfigureTool,
  eosPingTool,
  eosResetTool,
  eosSubscribeTool,
  ...workflowTools,
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
  ...showfileTools,
  ...queryTools,
  ...fpeTools,
  ...dmxTools,
  ...sessionTools,
  ...programmingTools
];

function collectOscAddresses(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectOscAddresses(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectOscAddresses(entry));
  }
  return [];
}

function withCatalogMetadata(tool: ToolDefinition): ToolDefinition {
  const classification = classifyToolMetadata(tool);
  const mapping = tool.config.annotations?.mapping as { osc?: unknown } | undefined;
  const requiresConfirmation = classification.requiresConfirmation;
  const policy = buildOscToolStrictModePolicy({
    oscAddresses: collectOscAddresses(mapping?.osc),
    requiresConfirmation
  });
  const metadata = {
    ...(tool.metadata ?? {}),
    ...classification,
    nativeOscPreferred: policy.nativeOscPreferred,
    cmdFallbackAllowed: policy.cmdFallbackAllowed,
    requiresConfirmation: policy.requiresConfirmation,
    strictModeBehavior: policy.strictModeBehavior
  };
  const { annotations: metadataAnnotations, ...annotationMetadata } = metadata;

  return {
    ...tool,
    config: {
      ...tool.config,
      annotations: {
        ...(tool.config.annotations ?? {}),
        ...(metadataAnnotations ?? {}),
        ...annotationMetadata,
        oscStrictModePolicy: policy
      }
    },
    metadata
  };
}

const definitions = rawDefinitions.map((tool) => withCatalogMetadata(tool as ToolDefinition));

export const toolDefinitions = definitions as ToolDefinition[];

export default toolDefinitions;
