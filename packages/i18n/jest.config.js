module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['@swc/jest'] },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
