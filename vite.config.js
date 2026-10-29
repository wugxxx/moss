import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { icons as lucide } from 'lucide';
import electron from 'vite-plugin-electron/simple';

const workspaceAliases = {
  '@moss/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
  '@moss/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
  '@moss/application': fileURLToPath(new URL('./packages/application/src/index.ts', import.meta.url)),
  '@moss/client': fileURLToPath(new URL('./packages/client/src/index.ts', import.meta.url)),
  '@moss/local-db': fileURLToPath(new URL('./packages/local-db/src/index.ts', import.meta.url)),
  '@moss/sync-core': fileURLToPath(new URL('./packages/sync-core/src/index.ts', import.meta.url)),
};

/* `virtual:icons` exports only the Lucide icons the source actually names, as inline SVG markup,
   so the bundle carries ~170 icons instead of the full set. Any quoted kebab-case token in src/
   that matches a Lucide icon name is included. */
function lucideSubset() {
  const id = 'virtual:icons',
    resolved = '\0' + id;
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.js$/.test(e.name) ? [p] : [];
    });
  const pascal = n =>
    n
      .split('-')
      .map(p => p[0].toUpperCase() + p.slice(1))
      .join('');
  return {
    name: 'lucide-subset',
    resolveId: s => (s === id ? resolved : null),
    load(s) {
      if (s !== resolved) return null;
      const text = walk(path.resolve('src'))
        .map(f => fs.readFileSync(f, 'utf8'))
        .join('\n');
      const names = [...new Set([...text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)].map(m => m[1]))].filter(n => lucide[pascal(n)]).sort();
      const out = {};
      for (const n of names) {
        let node = lucide[pascal(n)];
        if (node[0] === 'svg') node = node[2];
        out[n] = node
          .map(
            ([t, a]) =>
              `<${t} ${Object.entries(a)
                .filter(([k]) => k !== 'key')
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ')}/>`,
          )
          .join('');
      }
      return `export const ICONS = ${JSON.stringify(out)};`;
    },
  };
}

export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  return {
    plugins: [
      lucideSubset(),
      ...(desktop
        ? [
            electron({
              main: {
                entry: 'apps/desktop/src/main.ts',
                vite: {
                  resolve: { alias: workspaceAliases },
                },
                onstart({ startup }) {
                  void startup(['.', ...(process.env.ELECTRON_EXTRA_LAUNCH_ARGS?.split(' ').filter(Boolean) ?? [])]);
                },
              },
              preload: {
                input: 'apps/desktop/src/preload.ts',
                vite: {
                  resolve: { alias: workspaceAliases },
                },
              },
            }),
          ]
        : []),
    ],
    resolve: { alias: workspaceAliases },
    server: { port: 5173 },
  };
});
