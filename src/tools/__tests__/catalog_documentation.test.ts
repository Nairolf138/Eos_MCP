/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toolDefinitions } from '../index';

interface ManifestWorkflow {
  id?: unknown;
  recommended?: unknown;
  annotations?: { recommended?: unknown } | null;
}

interface ManifestDocument {
  mcp?: {
    capabilities?: {
      tools?: {
        featured_workflows?: ManifestWorkflow[];
      };
    };
  };
}

const repositoryRoot = path.resolve(__dirname, '../../..');

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('tool catalog documentation', () => {
  it('documents every exported tool in docs/tools.md', () => {
    const docs = readRepositoryFile('docs/tools.md');
    const documentedToolNames = new Set<string>();
    const headingPattern = /^## .+ \(`([^`]+)`\)$/gm;

    for (const match of docs.matchAll(headingPattern)) {
      documentedToolNames.add(match[1]);
    }

    const exportedToolNames = toolDefinitions.map((tool) => tool.name).sort();
    const missingToolNames = exportedToolNames.filter((toolName) => !documentedToolNames.has(toolName));

    expect(missingToolNames).toEqual([]);
  });

  it('keeps manifest recommended workflows aligned with registered tools', () => {
    const manifest = JSON.parse(readRepositoryFile('manifest.json')) as ManifestDocument;
    const registeredToolNames = new Set(toolDefinitions.map((tool) => tool.name));
    const featuredWorkflows = manifest.mcp?.capabilities?.tools?.featured_workflows ?? [];
    const recommendedWorkflowIds = featuredWorkflows
      .filter((workflow) => workflow.recommended === true || workflow.annotations?.recommended === true)
      .map((workflow) => workflow.id)
      .filter((id): id is string => typeof id === 'string');

    expect(recommendedWorkflowIds.length).toBeGreaterThan(0);

    const unknownWorkflowIds = recommendedWorkflowIds.filter((workflowId) => !registeredToolNames.has(workflowId));
    const nonWorkflowToolIds = recommendedWorkflowIds.filter((workflowId) => !workflowId.startsWith('eos_workflow_'));

    expect(unknownWorkflowIds).toEqual([]);
    expect(nonWorkflowToolIds).toEqual([]);
  });
});
