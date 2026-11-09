# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the Vite renderer: `shell/` owns rendering and routing, `pages/` and `views/` compose screens, `actions/` handles interactions, and `styles/` follows the cascade imported by `styles/index.css`.
- `packages/` contains strict TypeScript workspace packages: `contracts`, `domain`, `application`, `client`, `local-db`, `sync-core`, and `test-fixtures`.
- `apps/desktop/` contains the Electron main process, preload bridge, and packaging setup.
- `tests/` mirrors the package areas; `docs/`, `public/`, and `build/` hold documentation and static assets.
- Dependencies point inward. Do not import `local-db` or Electron APIs from renderer code.

## Build, Test, and Development Commands

Node.js 24 or newer is required.

- `npm install` installs root and workspace dependencies.
- `npm run dev` starts the web app at `http://localhost:8080`.
- `npm run dev:desktop` runs the renderer with the Electron shell.
- `npm run build` creates the production web build in `dist/`.
- `npm test` runs the Vitest suite; `npm run typecheck` checks strict TypeScript packages.
- `npm run lint`, `npm run format:check`, and `npm run format` run ESLint and Prettier.
- `npm run pack` and `npm run dist` create desktop artifacts in `release/`.

## Coding Style & Naming Conventions

- Use two-space indentation, LF endings, single quotes, trailing commas, and a 160-character print width.
- Use ES modules throughout. Keep the UI framework-free and compose screens as functions returning HTML strings.
- Use kebab-case filenames, camelCase functions and variables, and PascalCase TypeScript types and interfaces.
- Declare interactions with `data-a="actionName"`, `data-in`, or `data-blur`; write business data through `runCommand()` and the workspace client, not direct mutations of `S.data`.
- Route user-facing text through `t('namespace.key')` and keep `en.js` and `zh-CN.js` structurally aligned.

## UI Implementation Principles

- Drop secondary labels and descriptions; let the layout speak for itself.
- Minimize interactions that force a decision; when one is unavoidable, place it where the user is already choosing.
- Reduce unnecessary shadows and hover effects.
- Remove visual noise: keep it clean, quiet, and focused on what matters.

## Testing Guidelines

- Vitest tests live in `tests/<area>/*.test.ts` and use descriptive `describe` and `it` names.
- Run a focused file with `npx vitest run tests/i18n.test.ts`; run everything with `npm test`.
- There is no explicit coverage threshold. CI gates on lint, formatting, and a successful production build, so run `npm run lint`, `npm run format:check`, and `npm run build` before submitting.

## Commit & Pull Request Guidelines

- Follow the existing Conventional Commit style: `feat: add calendar drag and drop`, `fix: preserve quick task creation input`.
- Keep commits focused and use an imperative, lowercase summary.
- Pull requests should explain the change, list verification commands, link the relevant issue, and include screenshots or recordings for UI changes. Call out schema, migration, or desktop-packaging effects explicitly.
