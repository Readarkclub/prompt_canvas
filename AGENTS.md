# Repository Guidelines

## Project Structure & Module Organization

- `App.tsx` is the main entry for routing and page layout.
- `components/` contains React UI modules (canvas, chat, modals, icons). Files are `.tsx` and typically `PascalCase` (e.g., `ImageCanvas.tsx`).
- `services/` holds client-side integrations: `geminiService.ts` (calls `/api/gemini/*`) and `storageService.ts` (IndexedDB/local persistence). Service files use `camelCase` names.
- `edge-functions/` defines EdgeOne Edge Functions, including the unified Gemini proxy at `edge-functions/api/gemini/[[default]].js`.
- `types.ts` stores shared TypeScript types/enums. Build/config files live at root (`vite.config.ts`, `tsconfig.json`). `dist/` is generated output.
- Environment templates are in `.env.example`; local secrets go in `.env.local` (not committed).

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server at `http://localhost:3000` (frontend only).
- `npm run build`: production build into `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run pages:dev`: run EdgeOne Pages locally with edge functions (requires `npm install -g edgeone`).
- `npm run pages:deploy`: deploy to EdgeOne Pages.

## Coding Style & Naming Conventions

- TypeScript + React functional components with hooks. Prefer explicit prop types and shared models in `types.ts`.
- Indent 2 spaces, use semicolons, and keep formatting consistent with the surrounding file. Prefer single quotes in `.ts/.tsx` unless JSX readability suggests otherwise.
- Components: `PascalCase.tsx`, exported as named components. Hooks: `useX`. Services/utilities: `camelCase`.

## Testing Guidelines

No automated test suite is configured yet. Validate changes by running `npm run dev` and confirming `npm run build` succeeds. If you add a test setup, place tests as `*.test.ts`/`*.test.tsx` near the code and document the new script in `package.json`.

## Commit & Pull Request Guidelines

- Follow Conventional Commits seen in history: `feat:`, `fix:`, `docs:`, `chore:` with a short imperative subject.
- PRs should include: a clear description, steps to test, and screenshots/GIFs for UI changes. Call out any new env vars or Edge Function route changes.

## Security & Configuration Tips

- Never commit API keys or `.env.local`. Add new variables to `.env.example`.
- For production, set `GEMINI_API_KEY` in the EdgeOne project console.
