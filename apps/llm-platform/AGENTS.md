# LLM Platform Notes

## Overview

- `apps/llm-platform` is a standalone React + Vite console for gateway users.
- The app uses a lightweight local-state architecture without Redux.
- Login happens in `src/App.tsx`; authenticated users are routed into the main `Platform` container.

## Main Structure

- `src/views/Platform.tsx`
  - Owns top-level navigation state, URL syncing, data fetching, and most shared formatting helpers.
  - Fetches user, gateway, metrics, and diagnostics data through `src/helpers/platformApi.ts`.
- `src/views/platform/ConsolePage.tsx`
  - Hosts the console shell and switches between `ApiKeysPage` and `UsagePage`.
- `src/views/platform/DiagnosticsPage.tsx`
  - Renders request-level diagnostics and raw SSE payload inspection for authorized tokens.
- `src/views/platform/ApiDocsPage.tsx` and `src/views/platform/ModelMarketPage.tsx`
  - Serve as additional top-level platform sections.
  - API docs use the `DocsPage` route segment: `gateway-api`, `claude-zhipu`, and `aicode-cli`.
  - The `aicode-cli` tab provides installation, model configuration, usage, and troubleshooting guidance for AICode-CLI; keep its model/API-key guidance aligned with the platform. Use `REACT_APP_AICODE_PLACEHOLDER` for the company/environment portion of its document URLs, registry address, and contact email.

## API Keys Page

- `src/views/platform/ApiKeysPage.tsx` receives a flat `apiKeyUser.tokens` array from the backend.
- The page should group tokens in the UI by ownership:
  - Personal API Keys first.
  - Then one section per project.
- Token creation actions should stay close to the section they affect, so users do not confuse personal and project token creation.
- If project-owned tokens are returned for a project not present in `apiKeyUser.projects`, render them in a clearly marked fallback section instead of dropping them silently.
