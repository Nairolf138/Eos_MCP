# ETC Eos MCP Server

![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)
![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-MCP-5c4ee5.svg)
![OSC](https://img.shields.io/badge/ETC%20Eos-OSC-lightgrey.svg)

**ETC Eos MCP Server** is a production-oriented **Model Context Protocol (MCP) server for ETC Eos-family lighting consoles and Eos Nomad**. It connects AI assistants, agents and automation systems to Eos through **Open Sound Control (OSC)**, exposing more than 100 typed tools for cues, channels, groups, palettes, presets, effects, faders, submasters, patch, Magic Sheets, Pixel Maps, show data, diagnostics and higher-level lighting workflows.

The project is designed for **stage lighting automation, theatre lighting workflows and AI-assisted Eos programming** while keeping the operator in control through read-only mode, strict OSC validation, dry-runs, explicit confirmations and audit logging.

> **Résumé FR** — Eos MCP est un serveur MCP open source permettant de connecter des assistants IA et des outils d’automatisation aux consoles lumière **ETC Eos / Eos Nomad** via OSC. Il couvre la programmation, le patch, les cues, palettes, effets, faders, diagnostics et workflows avancés avec des garde-fous pensés pour l’exploitation scénique.

**Project website:** [NairolfConcept — Eos MCP](https://nairolfconcept.fr/eos-mcp.html)  
**Tool reference:** [`docs/tools.md`](docs/tools.md) · **Architecture:** [`docs/architecture.md`](docs/architecture.md) · **Live safety:** [`docs/live-safety-checklist.md`](docs/live-safety-checklist.md) · **OSC coverage:** [`docs/osc-coverage.md`](docs/osc-coverage.md)

---

## Why ETC Eos MCP?

Eos MCP is not just a thin “send an OSC string” bridge. It provides a structured tool layer intended for AI agents and automation systems that need to understand what they are allowed to do, preview changes and interact with an Eos console predictably.

| Capability | Eos MCP |
| --- | --- |
| ETC Eos / Eos Nomad control over OSC | ✅ |
| 100+ typed MCP tools | ✅ |
| Cues, channels, groups, palettes, presets, effects | ✅ |
| Faders, submasters, keys and Direct Selects | ✅ |
| Patch and fixture-oriented workflows | ✅ |
| Magic Sheets, Pixel Maps and show-control tools | ✅ |
| Read-only observation mode | ✅ |
| Strict ETC OSC mode | ✅ |
| Dry-run + explicit operator confirmation | ✅ |
| Audit logging | ✅ |
| MCP over STDIO | ✅ |
| Streamable HTTP MCP + HTTP/WS gateway | ✅ |
| Eos version / OSC compatibility tracking | ✅ |
| Higher-level workflows designed for LLM agents | ✅ |

## What can an AI agent do with Eos MCP?

Depending on the active safety profile and operator confirmation, an MCP client can use Eos MCP to:

- inspect connection state, capabilities, Eos version and show context;
- read or manipulate channels and intensity levels;
- work with groups, presets, color/focus/beam palettes and parameters;
- trigger, select, record or update cues and cue lists;
- control faders, submasters, macros, effects and console keys;
- assist with patching and fixture-oriented programming;
- interact with Direct Selects, Magic Sheets and Pixel Maps where supported;
- query show-control information and selected showfile data;
- execute guided multi-step workflows such as safe rehearsal playback, cue-series creation or band patch preparation;
- expose Eos capabilities to external automation systems without forcing every client to implement ETC OSC itself.

The complete generated catalog is in [`docs/tools.md`](docs/tools.md).

## Architecture

```text
AI assistant / MCP client / automation
                │
                │ Model Context Protocol
                ▼
        ┌──────────────────┐
        │     Eos MCP      │
        │ tools + safety   │
        │ workflows + audit│
        └────────┬─────────┘
                 │ OSC
                 ▼
        ETC Eos / Eos Nomad
```

Eos MCP acts as the controlled translation layer between an MCP client and ETC Eos. The server handles tool schemas, validation, safety policy, connection state and OSC message construction so the client can reason in terms of lighting operations rather than raw network packets.

See [`docs/architecture.md`](docs/architecture.md) for the internal architecture and [`docs/conformite-eos.md`](docs/conformite-eos.md) for the mapping between MCP tools and ETC Eos OSC behaviour.

## Quick start

### Requirements

- Node.js 20+
- npm 9+
- an ETC Eos-family console or **Eos Nomad**
- network access between the Eos MCP host and the console/Nomad instance
- an MCP-capable client or automation system

### Install

```bash
git clone https://github.com/Nairolf138/Eos_MCP.git
cd Eos_MCP
npm install
cp .env.example .env
```

For a first connection, start in observation mode:

```bash
EOS_READ_ONLY=true EOS_STRICT_MODE=true npm run start:dev
```

On Eos or Nomad, enable **OSC RX** and **OSC TX** under:

**Setup → System → Show Control → OSC**

Then configure the console ports to match your `.env` file and run `eos_readiness_check` before attempting programming or playback actions.

A typical safe starting point is:

```env
OSC_REMOTE_ADDRESS=192.168.50.10
OSC_TCP_PORT=3032
OSC_UDP_OUT_PORT=8001
OSC_UDP_IN_PORT=8000
OSC_LOCAL_ADDRESS=0.0.0.0

EOS_STRICT_MODE=true
EOS_READ_ONLY=true
EOS_MCP_ALLOWED_TOOL_PROFILE=read_only
EOS_AUDIT_ENABLED=true
EOS_AUDIT_LOG_FILE=logs/audit.log
```

Network setup details: [`docs/network-setup.md`](docs/network-setup.md).

## MCP transports

Eos MCP supports two main integration patterns.

### STDIO MCP

Suitable for local MCP clients that launch the server as a subprocess:

```bash
npm run build
npm start
```

### Streamable HTTP MCP / HTTP gateway

Set `MCP_TCP_PORT` to expose the HTTP MCP endpoint and the optional HTTP/WS gateway:

```bash
MCP_TCP_PORT=3032 npm run start:dev
```

Relevant endpoints include:

- `GET /health`
- `GET /tools`
- `GET /manifest.json`
- `POST /mcp`
- `POST /tools/:name`
- `WS /ws`

When exposing the HTTP transport beyond localhost, configure MCP tokens, IP allowlists, allowed origins and rate limiting. See [`docs/deployment.md`](docs/deployment.md) and [`docs/live-safety-checklist.md`](docs/live-safety-checklist.md).

## Safety model for live lighting control

> **Eos MCP can send real commands to a real lighting console. A valid OSC command can change output, record or update show data, alter patching or trigger playback in front of an audience.**

The recommended workflow is:

**plan → dry-run → operator review → explicit confirmation → execution → verification**

Key safeguards include:

- `EOS_READ_ONLY=true` to expose observation/read-only tools only;
- `EOS_STRICT_MODE=true` to prefer documented ETC OSC behaviour and reject unsupported or non-official paths according to the compatibility policy;
- MCP tool metadata describing read-only state, risk level and confirmation requirements;
- `dry_run=true` on supported high-level workflows;
- explicit `confirm` / `require_confirmation` gates for mutating actions;
- optional audit logging for MCP/OSC actions;
- readiness checks before live reads or writes.

New automations should be validated with **Eos Nomad/offline first**, then tested on the real console under operator supervision before use during a performance.

Read the full checklist before live use: [`docs/live-safety-checklist.md`](docs/live-safety-checklist.md).

## High-level workflows for AI agents

Eos MCP includes guided workflows that reduce the need for an LLM to assemble long sequences of low-level Eos commands itself. Examples include:

- `eos_workflow_autopatch_band` — prepare a structured band / fixture patch;
- `eos_workflow_create_look` — build a lighting look from channels, groups or palettes;
- `eos_workflow_create_cue_series` — generate a structured sequence of cues;
- `eos_workflow_update_cue_look` — preview and update an existing cue;
- `eos_workflow_create_effect` — prepare effect programming;
- `eos_workflow_rehearsal_go_safe` — guarded rehearsal playback.

These workflows are designed to expose previews and structured results that an AI agent can inspect before asking the operator to approve execution.

See [`docs/llm-agent-guide.md`](docs/llm-agent-guide.md) and [`docs/cookbook.md`](docs/cookbook.md).

## ETC Eos OSC compatibility

The project tracks which operations rely on documented ETC OSC addresses, compatibility fallbacks or MCP-side extensions. This matters because an operation being technically possible does not automatically make it appropriate for a live console.

Useful references:

- [`docs/conformite-eos.md`](docs/conformite-eos.md) — MCP tool ↔ ETC Eos OSC mapping;
- [`docs/osc-coverage.md`](docs/osc-coverage.md) — OSC endpoint coverage and officiality tracking;
- [`docs/eos-version-compatibility.md`](docs/eos-version-compatibility.md) — Eos 2.x / 3.x compatibility notes;
- [`docs/troubleshooting-osc-eos.md`](docs/troubleshooting-osc-eos.md) — Eos OSC troubleshooting.

## Documentation

| Topic | Document |
| --- | --- |
| Complete MCP tool catalog | [`docs/tools.md`](docs/tools.md) |
| Architecture | [`docs/architecture.md`](docs/architecture.md) |
| AI / LLM agent guide | [`docs/llm-agent-guide.md`](docs/llm-agent-guide.md) |
| Automation cookbook | [`docs/cookbook.md`](docs/cookbook.md) |
| Network setup | [`docs/network-setup.md`](docs/network-setup.md) |
| Live safety | [`docs/live-safety-checklist.md`](docs/live-safety-checklist.md) |
| Eos OSC compliance | [`docs/conformite-eos.md`](docs/conformite-eos.md) |
| OSC coverage | [`docs/osc-coverage.md`](docs/osc-coverage.md) |
| Version compatibility | [`docs/eos-version-compatibility.md`](docs/eos-version-compatibility.md) |
| Deployment | [`docs/deployment.md`](docs/deployment.md) |
| End-to-end testing | [`docs/testing-e2e.md`](docs/testing-e2e.md) |
| Adding a tool | [`docs/adding-a-tool.md`](docs/adding-a-tool.md) |
| Licensing guide | [`docs/licensing/README.md`](docs/licensing/README.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |

The previous long-form README has been preserved for reference in [`docs/README-legacy.md`](docs/README-legacy.md).

## Development

Useful commands:

```bash
npm run build
npm run lint
npm run tsc
npm test
npm run test:e2e
npm run docs:check
npm run check:agent-ready
npm run check:agent-ready:e2e
```

List the tools or validate the current configuration without starting a normal session:

```bash
npx ts-node src/server/index.ts --list-tools
npx ts-node src/server/index.ts --check-config
```

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/adding-a-tool.md`](docs/adding-a-tool.md).

## Project identity

**Eos MCP** is developed by **Florian Ribes (NairolfConcept)**.

- Website: [nairolfconcept.fr/eos-mcp.html](https://nairolfconcept.fr/eos-mcp.html)
- GitHub: [Nairolf138/Eos_MCP](https://github.com/Nairolf138/Eos_MCP)

Eos MCP is an independent project and is **not an official ETC product**. ETC, Eos and related product names are trademarks of their respective owners.

## License

The community edition is released under **GNU AGPLv3 (`AGPL-3.0-only`)**. See [`LICENSE`](LICENSE) and the [licensing guide](docs/licensing/README.md).

A separate commercial licensing path is documented for organisations that need to use Eos MCP without the obligations of AGPLv3.
