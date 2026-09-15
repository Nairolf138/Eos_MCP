# Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet respecte la [version sémantique](https://semver.org/lang/fr/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-15

### Ajouté

- Première release canonique correspondant à la version `1.0.0` du package et du manifest.
- Validation sur une console ETC Eos Ion Xe 20 et un parc lumière réel : patch, groupes, palettes de couleur/focus et cues.
- Eos MCP expose plus de 100 outils typés, des workflows guidés, STDIO et HTTP MCP, ainsi que des garde-fous pour l'exploitation live.
- Véritable Individual Contributor License Agreement v1.0 permettant la contribution open source et le dual licensing.

### Validation

- 675 tests unitaires passants lors de la validation finale de la branche principale.
- 4 tests de conformance OSC passants.
- Lint, TypeScript, documentation et manifest validés.
- Correction de l'environnement CI GitHub pour installer `ripgrep`, requis par un test d'architecture.

### Sécurité d'exploitation

- Eos MCP reste un projet indépendant et non officiel.
- Tester d'abord avec Eos Nomad/hors ligne, utiliser le dry-run et conserver une validation humaine avant toute action sur une console ou un spectacle.

## [v1.0.0-licensing] - 2026-04-05
### Ajouté
- Version de release dédiée `v1.0.0-licensing` pour formaliser la bascule licensing.
- Release notes de licensing avec date d’entrée en vigueur, impact utilisateurs existants, obligations commerciales et politique de compatibilité.
- Archivage des documents légaux applicables à la date de release avec empreintes d’intégrité SHA-256.

[1.0.0]: https://github.com/Nairolf138/Eos_MCP/releases/tag/v1.0.0
