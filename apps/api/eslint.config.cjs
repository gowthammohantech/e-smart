module.exports = [
  ...require('@esmart/eslint-config'),
  {
    rules: {
      // The MCP SDK publishes its modules through a wildcard `exports` map
      // (`./*`), which the import resolver doesn't follow; Node and tsc do.
      'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }],
    },
  },
];
