import { z } from 'zod';
import { getOscGateway, resetOscClient } from '../../services/osc/client.js';
import { createOscConnectionGateway } from '../../services/osc/index.js';
import { createLogger } from '../../server/logger.js';
import type { ToolDefinition } from '../types.js';

const inputSchema = {
  remoteAddress: z.string().min(1, 'remoteAddress doit etre une adresse valide.'),
  remotePort: z.number().int().min(1).max(65535),
  localPort: z.number().int().min(1).max(65535),
  tcpPort: z.number().int().min(1).max(65535).optional()
};

/**
 * @tool eos_configure
 * @summary Reconfiguration OSC EOS
 * @description Met a jour la configuration reseau OSC (ports, adresse) et recree le client partage.
 * @arguments Voir docs/tools.md#eos-configure pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-configure pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-configure pour un exemple OSC.
 */
export const eosConfigureTool: ToolDefinition<typeof inputSchema> = {
  name: 'eos_configure',
  config: {
    title: 'Reconfiguration OSC EOS',
    description: 'Met a jour la configuration reseau OSC (ports, adresse) et recree le client partage.',
    inputSchema
  },
  handler: async (args) => {
    const schema = z.object(inputSchema).strict();
    const options = schema.parse(args ?? {});

    const currentGateway = getOscGateway();
    currentGateway.close?.();

    const tcpPort = options.tcpPort ?? Number.parseInt(process.env.OSC_TCP_PORT ?? '3032', 10);
    const gateway = createOscConnectionGateway({
      host: options.remoteAddress,
      udpPort: options.remotePort,
      tcpPort: Number.isFinite(tcpPort) ? tcpPort : 3032,
      localPort: options.localPort,
      logger: createLogger('osc-gateway')
    });

    const client = resetOscClient(gateway);
    const diagnostics = client.getDiagnostics();

    const remoteAddress = diagnostics.config.remoteAddress ?? 'non defini';
    const remotePort = diagnostics.config.remotePort ?? 'non defini';

    const summary = [
      'Configuration OSC mise a jour :',
      `  Local : ${diagnostics.config.localAddress}:${diagnostics.config.localPort}`,
      `  Distant : ${remoteAddress}:${remotePort}`,
      `  Journalisation : entrant ${diagnostics.logging.incoming ? 'active' : 'inactive'}, sortant ${
        diagnostics.logging.outgoing ? 'active' : 'inactive'
      }`,
      `  Ecouteurs actifs : ${diagnostics.listeners.active}`
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: summary
        },
        {
          type: 'object',
          data: { diagnostics }
        }
      ]
    };
  }
};

export default eosConfigureTool;
