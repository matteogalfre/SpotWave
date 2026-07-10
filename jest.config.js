module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^../theme$': '<rootDir>/src/__mocks__/theme.ts',
    '^@spotwave/core$': '<rootDir>/packages/core/src/index.ts',
    '^@spotwave/core/(.*)$': '<rootDir>/packages/core/src/$1',
  },
};
