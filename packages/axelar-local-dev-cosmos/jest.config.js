module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
      '^.+\\.ts?$': 'ts-jest',
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  globalSetup: './jest/jest.global-setup.ts',
  globalTeardown: './jest/jest.global-teardown.ts',
  testTimeout: 120000,
};
