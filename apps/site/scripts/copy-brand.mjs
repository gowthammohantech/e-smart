// Copies the brand marks from packages/ui into public/brand, so the static
// export carries its own copies and packages/ui stays the one source.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ui = join(here, '../../../packages/ui/assets');
const out = join(here, '../public/brand');

const files = [
  'brand/elixir-mark.png',
  'brand/elixir-mark-dark.png',
  'brand/elixir-books.png',
  'brand/elixir-books-dark.png',
  'lixi/lixi-orb.png',
  'lixi/lixi-orb-animated.webp',
];

mkdirSync(out, { recursive: true });
for (const file of files) copyFileSync(join(ui, file), join(out, file.split('/').pop()));
