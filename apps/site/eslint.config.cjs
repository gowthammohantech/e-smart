module.exports = [
  ...require('@esmart/eslint-config'),
  { ignores: ['.next/*', 'out/*', 'next-env.d.ts'] },
  {
    // react-three-fiber JSX takes three.js props (position, args, metalness…),
    // and three.js objects (textures, materials) are mutated in place by design.
    files: ['components/three/**'],
    rules: { 'react/no-unknown-property': 'off', 'react-hooks/immutability': 'off' },
  },
];
