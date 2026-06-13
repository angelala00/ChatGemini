# Repository Guidelines

## Documentation & Engineering Principles

### 1.1 知识沉淀 (Knowledge Sedimentation)
- **`TODO.md` (Root)**: Used ONLY for **future tasks** and pending items. Do not store implemented technical design details here long-term.
- **`AGENTS.md` (Scoped)**: Each core module directory (e.g., `apps/assistant-web/`, `servers/assistant-bff/`) should have its own `AGENTS.md` to document its **current architecture**, core logic, and module-specific conventions.
- **Migration Rule**: When a technical task in `TODO.md` is completed, its implementation details and technical rationale must be migrated to the relevant module's `AGENTS.md`.

### 1.2 Documentation Hierarchy
- **`AGENTS.md` (Root)**: General engineering standards and repository-wide AI guidelines (this file).
- **`TESTING_GUIDE.md` (Root)**: Regression testing scenarios and quality assurance strategy.
- **`AGENTS.md` (Subdirectories)**: "Live" architectural descriptions for specific modules (e.g., `apps/assistant-web/AGENTS.md`, `servers/assistant-bff/app/AGENTS.md`).
- **`docs/proposals/`**: Active design drafts and ongoing architectural discussions.
- **`docs/archive/`**: Historical design documents and session handoffs for reference.

## Project Structure & Module Organization
- `apps/assistant-web`: main ChatGemini web client (React + Vite + Tailwind). Source in `apps/assistant-web/src`, static assets in `apps/assistant-web/public` and `apps/assistant-web/src/assets`.
- `apps/assistant-dashboard`: dashboard prototype (React + Vite + Tailwind). Source in `apps/assistant-dashboard/src`.
- `apps/llm-platform`: LLM platform console (React + Vite + Tailwind). Source in `apps/llm-platform/src`, static assets in `apps/llm-platform/public` (if present).
- `servers/assistant-bff`: FastAPI backend for the assistant app. App entry in `servers/assistant-bff/app/main.py`.
- `servers/assistant-metrics-api`: FastAPI service backing the dashboard. App entry in `servers/assistant-metrics-api/app/main.py`.
- `changelog.md`: project timeline notes.

## Build, Test, and Development Commands
- Web client (Vite dev server):
  ```bash
  cd apps/assistant-web
  npm install
  npm run dev
  ```
- Dashboard (Vite dev server):
  ```bash
  cd apps/assistant-dashboard
  npm install
  npm run dev
  ```
- LLM platform console (Vite dev server):
  ```bash
  cd apps/llm-platform
  npm install
  npm run dev
  ```
- Assistant BFF (FastAPI):
  ```bash
  cd servers/assistant-bff
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 5008
  ```
- Metrics API (FastAPI):
  ```bash
  cd servers/assistant-metrics-api
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 5010
  ```
- Optional background start scripts: `servers/assistant-bff/start.sh` and `servers/assistant-metrics-api/start.sh` (writes logs next to the script).

## Coding Style & Naming Conventions
- JavaScript/TypeScript uses ES modules, double quotes, and semicolons; follow the style in the file you touch.
- React components live in `src/components`, hooks in `src/hooks`, and helpers in `src/helpers`.
- Tailwind utility classes are preferred over bespoke CSS; keep custom styles in `src/index.css` when needed.

## Versioning & Release Notes
- Any user-visible behavior change should consider whether the app version needs to be updated.
- Current assistant-web version display is maintained in `apps/assistant-web/src/components/Sidebar.tsx` (`APP_VERSION`) together with the sidebar release history data.
- Update `changelog.md` when adding, changing, or removing user-facing functionality.
- Version number rules:
  - Small interaction polish or bug-fix style improvements bump the third number, e.g. `v1.0.1` -> `v1.0.2`.
  - Small feature additions bump the second number, e.g. `v1.0.1` -> `v1.1.0`.
  - Larger upgrades, architecture-level changes, or broad product changes bump the first number, e.g. `v1.0.1` -> `v2.0.0`.
- When bumping the version, keep these in sync: `APP_VERSION`, sidebar release history, locale text if needed, and `changelog.md`.

## Testing Guidelines
- No automated test suite is configured. Validate changes manually (run the relevant dev server and exercise the feature).
- If you introduce tests, document how to run them in the relevant app README.

## Commit & Pull Request Guidelines
- Commit history uses short, imperative summaries (e.g., “fix extract import”). Keep messages concise and scoped.
- PRs should include a brief summary, testing notes, and screenshots for UI changes. Link related issues when applicable.

## Configuration Tips
- `apps/assistant-web` expects `.env` values like `REACT_APP_GEMINI_API_KEY` and optional API URL overrides.
- `apps/assistant-dashboard` reads `VITE_*` variables (see `apps/assistant-dashboard/README.md` for defaults).
- Avoid committing secrets; keep API keys in local env files.
