# Project context

- Cornote is a React/Vite PWA. Without Supabase settings, it runs in local-only mode with Mock AI.
- Development runs with `npm run dev` or `docker compose up --build` at http://localhost:5173.
- Docker uses `node:24-alpine`, a source bind mount, and a separate `/app/node_modules` volume for live updates.
- Optional browser Supabase settings go in `.env.local`; the Vite container must be restarted after changing them.
- Cornote also builds as an Electron desktop app using the existing React UI and repositories. Desktop source is in `desktop/`; run `npm run dev -- --mode desktop` with `npm run desktop:dev`, or package with `npm run desktop:mac` (arm64/x64 DMG) and `npm run desktop:win` (x64 NSIS). Output is ignored under `desktop-release/`.
- Desktop data uses a separate IndexedDB origin (`cornote-app://local`). Move local PWA data using Settings JSON export/import. Desktop export uses a validated Electron save dialog bridge; PWA export stays browser based.
- Desktop Supabase email links use `cornote://auth/callback`; configure this Auth redirect and include `cornote-app://local` in the Edge Function `ALLOWED_ORIGIN` comma-separated list. Cloud/real AI were not exercised without Supabase credentials.
- Mac arm64 packaged smoke check covers launch, note persistence, and JSON export; unit tests and lint pass. Windows x64 installer was built on macOS but has not been run on Windows. Builds are unsigned until distribution certificates are supplied.
- Desktop implementation steps, key files, build commands, verification, and remaining checks are documented in `docs/desktop-development.md` and linked from README.
- 2026-11-14: Edge Functions pass `deno check` (Docker `denoland/deno:2.1.4`, per-function `deno.json`), and the pgTAP RLS test passes 18/18 on Docker `supabase/postgres:15.8.1.060` after aligning that bare image's `auth.uid()` with GoTrue's `request.jwt.claims` form. Details in `docs/implementation-plan.md`. Still unverified: real Supabase deploy, OpenAI calls, email redirects, Windows device run, code signing.
