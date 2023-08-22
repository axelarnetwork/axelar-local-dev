module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    testRegex: '/__tests__/.*\\.(test|spec)?\\.(ts)$',
    transformIgnorePatterns: ['<rootDir>/node_modules/'],
    testTimeout: 300000,
};
