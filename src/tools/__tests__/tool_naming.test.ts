import { toolDefinitions } from '../index';

describe('tool naming conventions', () => {
  it('uses snake_case for tool names', () => {
    const snakeCasePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

    for (const tool of toolDefinitions) {
      expect(tool.name).toMatch(snakeCasePattern);
    }
  });
});
