const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;
const tsJestKey = Object.keys(tsJestTransformCfg).find((key) => key.includes('tsx')) ?? '^.+\\.tsx?$';
const tsJestOptions = tsJestTransformCfg[tsJestKey][1] ?? {};
tsJestTransformCfg[tsJestKey][1] = {
  ...tsJestOptions,
  diagnostics: false
};

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};
