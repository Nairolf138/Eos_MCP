import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

type OflMode = {
  name: string;
  channels?: string[];
};

type OflFixture = {
  name: string;
  manufacturerKey: string;
  fixtureKey: string;
  modes?: OflMode[];
};

type ManufacturerRecord = {
  name?: string;
};

type FixtureOutput = {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  aliases?: string[];
  modes: Array<{ name: string; dmx_footprint: number }>;
};

const projectRoot = path.resolve(__dirname, '..');
const zipPath = path.join(projectRoot, 'src', 'fixtures', 'ofl_export_ofl.zip');
const outputPath = path.join(projectRoot, 'src', 'fixtures', 'fixtures.json');

const normalizeValue = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const formatFixtureKey = (fixtureKey: string) => titleCase(fixtureKey.replace(/[-_]+/g, ' '));

const listJsonFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      return [fullPath];
    }
    return [];
  });
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofl-export-'));

try {
  execFileSync('unzip', ['-q', zipPath, '-d', tempDir], { stdio: 'inherit' });

  const manufacturersPath = path.join(tempDir, 'manufacturers.json');
  const manufacturersData = JSON.parse(fs.readFileSync(manufacturersPath, 'utf8')) as Record<
    string,
    ManufacturerRecord
  >;

  const allJsonFiles = listJsonFiles(tempDir).filter(
    (filePath) => path.basename(filePath) !== 'manufacturers.json'
  );

  const fixtures: FixtureOutput[] = [];

  for (const filePath of allJsonFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fixture = JSON.parse(raw) as OflFixture;
    if (!fixture.name || !fixture.manufacturerKey || !fixture.fixtureKey) {
      continue;
    }

    const manufacturerName = manufacturersData[fixture.manufacturerKey]?.name ?? fixture.manufacturerKey;
    const modelName = fixture.name;
    const formattedKey = formatFixtureKey(fixture.fixtureKey);
    const aliases = [formattedKey].filter(
      (alias) => normalizeValue(alias) !== normalizeValue(modelName)
    );

    const modes = (fixture.modes ?? []).map((mode) => ({
      name: mode.name,
      dmx_footprint: Array.isArray(mode.channels) ? mode.channels.length : 0
    }));

    fixtures.push({
      id: `${fixture.manufacturerKey}-${fixture.fixtureKey}`,
      manufacturer: manufacturerName,
      model: modelName,
      name: modelName,
      aliases: aliases.length > 0 ? aliases : undefined,
      modes
    });
  }

  fixtures.sort(
    (a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name)
  );

  fs.writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log(`Fixtures generees: ${fixtures.length}`);
  console.log(`Sortie: ${outputPath}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
