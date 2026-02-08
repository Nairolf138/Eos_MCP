import { z, type ZodRawShape } from 'zod';
import { searchFixtures } from '../../fixtures';
import type { ToolDefinition } from '../types';

const fixtureSearchInputSchema = {
  query: z.string().trim().min(1).max(128).optional(),
  manufacturer: z.string().trim().min(1).max(128).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  mode: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
} satisfies ZodRawShape;

/**
 * @tool eos_fixture_search
 * @summary Recherche dans la bibliotheque de fixtures
 * @description Recherche dans la bibliotheque de fixtures par nom, marque, modele ou mode.
 * @arguments Voir docs/tools.md#eos-fixture-search pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fixture-search pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fixture-search pour un exemple OSC.
 */
export const eosFixtureSearchTool: ToolDefinition<typeof fixtureSearchInputSchema> = {
  name: 'eos_fixture_search',
  config: {
    title: 'Recherche fixture',
    description: 'Recherche dans la bibliotheque de fixtures par nom, marque, modele ou mode.',
    inputSchema: fixtureSearchInputSchema
  },
  handler: async (args) => {
    const options = z.object(fixtureSearchInputSchema).strict().parse(args ?? {});
    const matches = searchFixtures(options);
    const total = matches.length;
    const results = matches.map((match) => ({
      id: match.fixture.id,
      manufacturer: match.fixture.manufacturer,
      model: match.fixture.model,
      name: match.fixture.name,
      aliases: match.fixture.aliases ?? [],
      modes: match.matchedModes,
      score: match.score
    }));

    return {
      content: [
        {
          type: 'text',
          text: total === 0 ? 'Aucune fixture trouvee.' : `${total} fixture(s) trouvee(s).`
        }
      ],
      structuredContent: {
        total,
        results
      }
    };
  }
};

export default [eosFixtureSearchTool];
