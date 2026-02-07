import { getOscClient, getOscConnectionStateProvider, type OscJsonResponse } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { getCurrentUserId } from '../session';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import { getPackageVersion, getServerCompatibility } from '../../utils/version';
import { getCapabilitiesToolNames } from './context';

const emptySchema = {} as const;

const FAMILY_MATCHERS: Array<{ family: string; matches: (name: string) => boolean }> = [
  { family: 'connection', matches: (name) => name.startsWith('eos_connect') || name.startsWith('eos_configure') || name.startsWith('eos_ping') || name.startsWith('eos_reset') || name.startsWith('eos_subscribe') },
  { family: 'commands', matches: (name) => name.startsWith('eos_command') || name.startsWith('eos_new_command') },
  { family: 'channels', matches: (name) => name.startsWith('eos_channel_') },
  { family: 'groups', matches: (name) => name.startsWith('eos_group_') },
  { family: 'cues', matches: (name) => name.startsWith('eos_cue_') || name.startsWith('eos_cuelist_') },
  { family: 'palettes', matches: (name) => name.startsWith('eos_palette_') || name.startsWith('eos_color_palette_') || name.startsWith('eos_focus_palette_') || name.startsWith('eos_beam_palette_') || name.startsWith('eos_intensity_palette_') },
  { family: 'presets', matches: (name) => name.startsWith('eos_preset_') },
  { family: 'submasters', matches: (name) => name.startsWith('eos_submaster_') },
  { family: 'faders', matches: (name) => name.startsWith('eos_fader_') },
  { family: 'macros', matches: (name) => name.startsWith('eos_macro_') },
  { family: 'effects', matches: (name) => name.startsWith('eos_effect_') },
  { family: 'parameters', matches: (name) => name.startsWith('eos_parameter_') },
  { family: 'keys', matches: (name) => name.startsWith('eos_key_') || name.startsWith('eos_softkey_') },
  { family: 'direct_selects', matches: (name) => name.startsWith('eos_direct_select_') },
  { family: 'magic_sheets', matches: (name) => name.startsWith('eos_magic_sheet_') },
  { family: 'pixel_maps', matches: (name) => name.startsWith('eos_pixel_map_') },
  { family: 'curves', matches: (name) => name.startsWith('eos_curve_') },
  { family: 'patch', matches: (name) => name.startsWith('eos_patch_') },
  { family: 'snapshots', matches: (name) => name.startsWith('eos_snapshot_') },
  { family: 'show_control', matches: (name) => name.startsWith('eos_get_show_name') || name.startsWith('eos_get_live_blind_state') || name.startsWith('eos_toggle_staging_mode') || name.startsWith('eos_set_cue_') },
  { family: 'queries', matches: (name) => name.startsWith('eos_query_') },
  { family: 'fpe', matches: (name) => name.startsWith('eos_fpe_') },
  { family: 'dmx', matches: (name) => name.startsWith('eos_dmx_') },
  { family: 'session', matches: (name) => name.startsWith('session_') },
  { family: 'programming', matches: (name) => name.startsWith('eos_programming_') },
  { family: 'workflows', matches: (name) => name.startsWith('eos_workflow_') },
  { family: 'diagnostics', matches: (name) => name.startsWith('eos_get_diagnostics') || name.startsWith('eos_enable_logging') || name.startsWith('eos_capabilities_get') }
];

function groupByFamily(toolNames: string[]): Record<string, { count: number; tools: string[] }> {
  const families: Record<string, { count: number; tools: string[] }> = {};
  const unclassified: string[] = [];

  toolNames.forEach((toolName) => {
    const matcher = FAMILY_MATCHERS.find((item) => item.matches(toolName));
    if (!matcher) {
      unclassified.push(toolName);
      return;
    }

    if (!families[matcher.family]) {
      families[matcher.family] = { count: 0, tools: [] };
    }

    families[matcher.family]!.tools.push(toolName);
    families[matcher.family]!.count += 1;
  });

  if (unclassified.length > 0) {
    families.misc = {
      count: unclassified.length,
      tools: unclassified.sort((a, b) => a.localeCompare(b))
    };
  }

  Object.values(families).forEach((family) => {
    family.tools.sort((a, b) => a.localeCompare(b));
  });

  return families;
}

function parseLiveBlindLabel(payload: unknown): 'live' | 'blind' | 'unknown' {
  if (payload && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>).state;
    if (value === 1 || value === '1' || value === 'live') {
      return 'live';
    }
    if (value === 0 || value === '0' || value === 'blind') {
      return 'blind';
    }
  }

  return 'unknown';
}

/**
 * @tool eos_capabilities_get
 * @summary Capacites serveur EOS MCP
 * @description Retourne les fonctionnalites disponibles par famille, le contexte de session/connexion et la version serveur.
 * @arguments Voir docs/tools.md#eos-capabilities-get pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-capabilities-get pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-capabilities-get pour un exemple OSC.
 */
export const eosCapabilitiesGetTool: ToolDefinition<typeof emptySchema> = {
  name: 'eos_capabilities_get',
  config: {
    title: 'Capacites serveur EOS MCP',
    description:
      'Retourne les fonctionnalites disponibles par famille, le contexte de session/connexion et la version serveur.',
    inputSchema: emptySchema
  },
  handler: async (args) => {
    if (args && Object.keys(args as Record<string, unknown>).length > 0) {
      throw new Error('Cet outil ne prend pas de parametres.');
    }

    const tools = getCapabilitiesToolNames();
    const families = groupByFamily(tools);

    const connectionStateProvider = getOscConnectionStateProvider();
    const oscConnection = connectionStateProvider
      ? connectionStateProvider.getOverview()
      : { health: 'offline', transports: { tcp: { state: 'disconnected' }, udp: { state: 'disconnected' } }, updatedAt: Date.now() };

    const user = getCurrentUserId();

    const client = getOscClient();
    let liveBlindMode: 'live' | 'blind' | 'unknown' = 'unknown';
    let liveBlindRaw: OscJsonResponse | null = null;

    try {
      liveBlindRaw = await client.requestJson(oscMappings.showControl.liveBlindState, { timeoutMs: 400 });
      liveBlindMode = parseLiveBlindLabel(liveBlindRaw.data);
    } catch (_error) {
      liveBlindMode = 'unknown';
    }

    const safety = {
      default_safety_level: 'strict',
      require_confirmation_for_sensitive_actions: true,
      active: true
    };

    const version = getPackageVersion();
    const compatibility = getServerCompatibility();

    const summary = [
      `Capacites disponibles: ${tools.length} outils, ${Object.keys(families).length} familles.`,
      `Connexion OSC: ${oscConnection.health}.`,
      `Utilisateur courant: ${typeof user === 'number' ? user : 'non defini'}.`,
      `Mode console: ${liveBlindMode}.`,
      `Version serveur: ${version}.`
    ].join(' ');

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        capabilities: {
          total_tools: tools.length,
          families
        },
        context: {
          osc_connection: oscConnection,
          current_user: user,
          mode: {
            live_blind: liveBlindMode,
            raw: liveBlindRaw?.data ?? null
          },
          safety
        },
        server: {
          version,
          compatibility
        }
      }
    } as ToolExecutionResult;
  }
};

export default eosCapabilitiesGetTool;
