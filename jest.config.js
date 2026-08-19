/**
 * Jest configuration — unit tests live next to sources as `*.test.ts`
 * and are excluded from the tsc build via tsconfig.json.
 */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
};
