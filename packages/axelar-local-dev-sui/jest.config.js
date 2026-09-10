module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // cgp-sui's "browser" export condition silently drops every publishing helper
    // (its web build re-exports TxBuilderBase as TxBuilder and ships no node-utils).
    // Pin the resolver to node so we never load that build by accident.
    testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] },
    transform: { '^.+\\.ts$': 'ts-jest' },
    transformIgnorePatterns: ['<rootDir>/node_modules/'],
    testTimeout: 300000,
    // Every publishing suite shares one faucet and one deployer address; parallel
    // workers equivocate on gas objects.
    maxWorkers: 1,
};
