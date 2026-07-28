# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment rule — READ FIRST

**Never deploy to production** (`firebase deploy`, `npm run fb:deploy-functions`, or any `firebase ...` command that pushes rules/functions/hosting to the live project) **without an explicit "GO OFFICIEL" from the user.** Building, testing, and committing locally is always fine; pushing to Firebase prod is not, even if a task seems to imply shipping.

**Production is hosted on Vercel, not Firebase Hosting:** the live app the 3 real users hit is `https://projmaster-chi.vercel.app/` (discovered 2026-07-26 — not documented anywhere else). Vite's `VITE_*` env vars are baked in at **build time**, so what Firestore database the live site talks to is controlled by the environment variables configured in the **Vercel project dashboard** (Settings → Environment Variables), completely independent of this repo's `.env.local`. Changing `.env.local` only affects your own `npm run dev`/`npm run build` locally — cutting over the real production users requires changing the Vercel env var and triggering a Vercel redeploy, which is a live production action and needs the same "GO OFFICIEL" gate as a Firebase deploy.

**Vercel `VITE_FIRESTORE_DB_ID` cutover completed 2026-07-28 (GO OFFICIEL given):** Production is scoped to `prod`; Preview and Development are scoped to `sandbox` (added as separate per-environment entries in Vercel — before this, no `VITE_FIRESTORE_DB_ID` var existed at all in Vercel, so every deployment including Preview builds from feature branches was silently hitting the real `default` database). `VITE_FIREBASE_*` vars were already correctly set for Production (added 2026-07-05), scoped Production-only — if Preview/Development builds ever need real Firebase Auth, those would need adding too, but Preview currently isn't scoped for `VITE_FIREBASE_*`. Note: `firebase.json`'s firestore targets (`dev`→`sandbox`, `prod`→`prod`) mean rules can no longer be deployed to the raw `default`/`(default)` database names directly — only `sandbox`/`prod` are reachable via `firebase deploy --only firestore:<target>`.

**Gotcha hit during this cutover:** switching Production straight to `prod` and redeploying produced an app that looked like "can't log in" — actually Firebase Auth succeeded, but `useAuth.jsx`'s `getUserDoc(uid)` read against the new `prod` database failed/hung (rules propagation or cache lag), leaving `user` truthy but `userDoc` null — a state `App.jsx` doesn't handle (neither the `init()` branch nor the `navigate('/login')` branch fires), so the UI just hangs. Rolling back the env var to `default` and redeploying, then confirming `firebase deploy --only firestore:prod` had cleanly completed, then retrying the cutover in an incognito window resolved it. If this resurfaces, that inconsistent-auth-state gap in `App.jsx`/`useAuth.jsx` is the place to look.

**Firestore databases (project `projmaster-v3`), renamed 2026-07-26 for clarity:** `sandbox` = dev/test data (local dev only, `VITE_FIRESTORE_DB_ID` in `.env.local`), `prod` = real production data. These are clean clones (via `firebase firestore:databases:clone`) of the original confusingly-named `(default)` (was actually the empty test db) and `default` (was actually real prod, 3 users) — both originals are left untouched as historical fallback, alongside a point-in-time safety snapshot `prod-backup-2026-07-26`. There's also a `test` database of unknown/legacy origin that predates this cleanup — don't assume it's safe to reuse or delete without checking its contents first. `firebase.json` uses deploy **targets** (`dev` → `sandbox`, `prod` → `prod`, mapped in the untracked `.firebaserc`) so the two can be deployed independently — `firebase deploy --only firestore:dev` touches only `sandbox`, `firebase deploy --only firestore:prod` touches real prod data. Never run the untargeted `firebase deploy --only firestore` — with this array config it deploys to *both* at once.

**Setting up the targets on a new machine:** `firebase-tools` 15.22.3's `firebase target:apply firestore dev <resource>` CLI command is broken (its `.firebaserc` validation whitelist — `lib/rc.js` `TARGET_TYPES` — only allows `storage`/`database`/`hosting`, not `firestore`, even though the Firestore deploy code itself expects and requires a `firestore` target to be set). The actual fix is to hand-edit the untracked `.firebaserc` and add the mapping directly:
```json
"targets": { "<project-id>": { "firestore": { "dev": ["sandbox"], "prod": ["prod"] } } }
```
(`<project-id>` is whatever `firebase use --add` set, e.g. `projmaster-v3`.) Once that's in place, `firebase deploy --only firestore:dev` / `:prod` work normally. Note Firestore database IDs must be 4-63 characters (`dev` alone is rejected).

## Commands

```
npm run dev                  # start dev server (localhost:5175, strict port)
npm run build                # vite build
npm run preview              # serve the build (localhost:5176, strict port)
npm run prod                 # build + preview
npm run lint                 # eslint .
npm run test                 # vitest run (whole suite, single pass)
npx vitest run <path>        # run a single test file, e.g. src/utils/craParser.test.js
npx vitest run -t "<name>"   # run a single test by name
npm run fb                   # firebase CLI wrapper (see deployment rule above)
npm run fb:deploy-functions  # deploy Cloud Functions only (see deployment rule above)
```

Env setup: copy `.env.local.example` → `.env.local` and fill in `VITE_FIREBASE_*` from the Firebase console (this is what the app actually runs on). `.env.example` (`VITE_SUPABASE_*`) is legacy — see Data layer below.

## Architecture

**Stack:** React 19 + Vite, React Router v7 (data router in `src/router.jsx`), Zustand (`src/store/useAppStore.js`) as the single global store, Tailwind v4 via `@tailwindcss/vite`.

**Data layer — Firebase is the real backend.** `src/firebase/firestore.js` exposes `subscribe*`/`save*`/`patch*` functions per collection (`collaborateurs`, `projets`, `users`, `taches`). `useAppStore.init(userDoc)` wires up `onSnapshot` listeners for all of them and keeps the store in sync in real time; `destroy()` unsubscribes. `App.jsx` calls `init`/`destroy` based on auth state from `useAuth()`. `src/data/supabase.js` and the `loadData`/`saveData` functions in `src/data/storage.js` are legacy/inactive — only `exportData`/`importData` from `storage.js` are still used (local JSON backup/restore in `Parametres.jsx`), don't assume Supabase is live storage.

**`taches` collection** = the PM's personal to-do list on the homepage (`src/components/dashboard/MesActions.jsx`), independent of any `projet` — 4 statuses (`a_faire`/`en_cours`/`termine`/`bloque`) + optional `deadline`. Admin-only (gated in both `useAppStore.init` and `firestore.rules`), not visible/subscribed for `collaborateur` role.

**Auth & access control:** Firebase Auth + a `users/{uid}` Firestore doc holding `role` (`admin` | `collaborateur`) and, for collaborateurs, `projets_autorises` (array of allowed projet IDs). `ProtectedRoute`/`AdminRoute` (`src/components/auth/`) gate routes off this; `firestore.rules` enforces the same model server-side (`isAdmin()`, `isCollab()`, `canAccessProjet()`) — when adding a field or collection with access restrictions, update both the client gating and `firestore.rules`. `functions/index.js` has one callable (`changeUserPassword`, admin-only, used by the admin console to reset another user's password).

**Data model:** everything for a project lives on a single `projets/{id}` Firestore document — no subcollections. A projet has `type: 'BUILD' | 'RUN'`, which changes how `commandes`/facturation/conso behave (see the comment above `addCommande` in the store). The WBS is a **flat array** of nodes with `parent_id` (not a nested tree) — hierarchy, numbering, budget rollups, and cascade deletes are all done by filtering `wbs` on `parent_id` (see `calculerNumeroWBS`, `calculerBudgetNoeud`, `deleteWBSNode` in the store).

**Schema evolution via `migrateProjet()`:** every projet document read from Firestore is passed through `migrateProjet()` in `useAppStore.js`, which backfills missing fields and converts legacy shapes on the fly (e.g. old flat `risques` arrays → the `riad` structure via `migrerRisqueLegacy`). There's no DB migration step — if you add a new field to a projet, give it a default in `migrateProjet()` (and in the `addProjet` defaults) rather than assuming existing documents have it.

**Domain logic lives in pure, tested modules**, not in components: `src/data/calculations.js` (budget/WBS math) and `src/utils/*.js` (`craParser`, `wbsPivotParser`/`wbsPivotTemplate`, `riadCalculs`, `runCalculs`, `factureExport`), each with a co-located `*.test.js`. New calculation/parsing/export logic should go in one of these modules so it stays unit-testable, rather than inline in a page/component.

**RIAD module** = Risques / Issues / Actions / Décisions, the project's risk register (`src/components/riad/`, `src/pages/ProjetRiad.jsx`), keyed under `projet.riad.{risques,issues,actions,decisions}`, each item with an `escalade` level drawn from `projet.escalade_niveaux`.

**EVM (CPI/SPI)** lives in `src/utils/evmCalculs.js`, BUILD projects only (`calculerEVMProjet`/`calculerEVMPortefeuille` return `null`/skip for RUN). EV comes from the manual `avancement` % on each WBS leaf (not derived from `jours_realises`); PV comes from daily `affectation.planning` when populated, else a linear fallback between `date_debut_prev`/`date_fin_prev`. This is computed live against the current plan, not a frozen baseline — `projet.reporting_snapshots` exists in the schema but is unused; it's the natural place to freeze a periodic PV/EV/AC snapshot if true baseline-tracking EVM is needed later.
