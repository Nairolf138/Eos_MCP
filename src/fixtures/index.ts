import fixturesData from './fixtures.json';

export interface FixtureMode {
  name: string;
  dmx_footprint?: number;
  channels?: number;
}

export interface FixtureDefinition {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  aliases?: string[];
  modes: FixtureMode[];
}

export interface FixtureSearchFilters {
  query?: string;
  manufacturer?: string;
  model?: string;
  name?: string;
  mode?: string;
  limit?: number;
}

export interface FixtureSearchMatch {
  fixture: FixtureDefinition;
  matchedModes: FixtureMode[];
  score: number;
}

export interface FixtureResolutionInput {
  deviceType?: string;
  fixtureQuery?: string;
  fixtureManufacturer?: string;
  fixtureModel?: string;
  fixtureName?: string;
  fixtureMode?: string;
}

export interface FixtureResolution {
  fixture: FixtureDefinition;
  mode: FixtureMode;
  deviceType: string;
  score: number;
}

const fixtures = fixturesData as FixtureDefinition[];

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const includesNormalized = (value: string, query: string) => normalize(value).includes(normalize(query));

const equalsNormalized = (value: string, query: string) => normalize(value) === normalize(query);

const matchFixtureMode = (modeName: string, query?: string) => {
  if (!query) {
    return true;
  }
  return includesNormalized(modeName, query);
};

const matchFixtureField = (value: string, query?: string) => {
  if (!query) {
    return true;
  }
  return includesNormalized(value, query);
};

const matchFixtureQuery = (fixture: FixtureDefinition, query?: string) => {
  if (!query) {
    return true;
  }
  if (includesNormalized(fixture.name, query) || includesNormalized(fixture.model, query)) {
    return true;
  }
  if (includesNormalized(fixture.manufacturer, query)) {
    return true;
  }
  if (fixture.aliases?.some((alias) => includesNormalized(alias, query))) {
    return true;
  }
  return fixture.modes.some((mode) => includesNormalized(mode.name, query));
};

const scoreFixtureMatch = (fixture: FixtureDefinition, filters: FixtureSearchFilters): number => {
  let score = 0;
  if (filters.query) {
    if (equalsNormalized(fixture.name, filters.query) || equalsNormalized(fixture.model, filters.query)) {
      score += 5;
    } else if (includesNormalized(fixture.name, filters.query) || includesNormalized(fixture.model, filters.query)) {
      score += 3;
    }
    if (includesNormalized(fixture.manufacturer, filters.query)) {
      score += 2;
    }
    if (fixture.aliases?.some((alias) => includesNormalized(alias, filters.query))) {
      score += 2;
    }
    if (fixture.modes.some((mode) => includesNormalized(mode.name, filters.query))) {
      score += 1;
    }
  }
  if (filters.manufacturer && includesNormalized(fixture.manufacturer, filters.manufacturer)) {
    score += 2;
  }
  if (filters.model && includesNormalized(fixture.model, filters.model)) {
    score += 2;
  }
  if (filters.name && includesNormalized(fixture.name, filters.name)) {
    score += 2;
  }
  return score;
};

export const searchFixtures = (filters: FixtureSearchFilters): FixtureSearchMatch[] => {
  const matches: FixtureSearchMatch[] = [];
  const limit = filters.limit ?? 25;

  for (const fixture of fixtures) {
    if (!matchFixtureQuery(fixture, filters.query)) {
      continue;
    }
    if (!matchFixtureField(fixture.manufacturer, filters.manufacturer)) {
      continue;
    }
    if (!matchFixtureField(fixture.model, filters.model)) {
      continue;
    }
    if (!matchFixtureField(fixture.name, filters.name)) {
      continue;
    }
    const matchingModes = fixture.modes.filter((mode) => matchFixtureMode(mode.name, filters.mode));
    if (matchingModes.length === 0) {
      continue;
    }

    matches.push({
      fixture,
      matchedModes: matchingModes,
      score: scoreFixtureMatch(fixture, filters)
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.fixture.name.localeCompare(b.fixture.name))
    .slice(0, limit);
};

export const resolveFixture = (input: FixtureResolutionInput): FixtureResolution => {
  if (input.deviceType) {
    throw new Error('resolveFixture ne doit pas etre appele avec deviceType.');
  }

  const matches = searchFixtures({
    query: input.fixtureQuery ?? input.fixtureName ?? input.fixtureModel ?? undefined,
    manufacturer: input.fixtureManufacturer,
    model: input.fixtureModel,
    name: input.fixtureName,
    mode: input.fixtureMode,
    limit: 10
  });

  if (matches.length === 0) {
    throw new Error('Aucune fixture ne correspond aux criteres fournis.');
  }

  const [best, ...rest] = matches;
  if (rest.length > 0 && rest[0].score === best.score) {
    throw new Error('Plusieurs fixtures correspondent. Precisez le modele ou le mode.');
  }

  const fixture = best.fixture;
  let mode: FixtureMode | undefined;
  if (input.fixtureMode) {
    mode = fixture.modes.find((candidate) => includesNormalized(candidate.name, input.fixtureMode as string));
    if (!mode) {
      throw new Error('Mode de fixture non trouve pour la fixture selectionnee.');
    }
  } else if (fixture.modes.length === 1) {
    mode = fixture.modes[0];
  } else {
    throw new Error('Plusieurs modes disponibles. Precisez fixture_mode.');
  }

  const deviceType = `${fixture.manufacturer} ${fixture.model} ${mode.name}`.trim();

  return {
    fixture,
    mode,
    deviceType,
    score: best.score
  };
};

export default fixtures;
