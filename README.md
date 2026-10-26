# Dep Signal — npm package intelligence

Dep Signal is a standalone HyperDart component for quickly understanding npm dependencies. It turns natural-language package queries into a package brief, a factual comparison, or a short list of related packages.

## What it does

- **Package details:** latest published version, release date, weekly downloads, deprecation status, license, TypeScript metadata, ESM metadata, Node.js requirement, and unpacked size.
- **Compare two or three packages:** side-by-side registry facts, daily downloads for the last month, and factual highlights from available npm data.
- **Find alternatives:** related npm search results with shared keywords and weekly download counts where available.
- **Discover for a use case:** npm search results for queries such as “best npm package for date formatting.”
- **Follow up in place:** find alternatives, add a package to a comparison, or inspect a suggested package without submitting a new search.

Downloads describe install activity, not package quality. Missing metadata is shown as unavailable instead of being guessed.

## Design decisions

The visual system is a compact dependency brief with concise fact cards and a restrained comparison chart. Mainline uses the available width; sidebar switches to a single-column layout. The component supports light and dark themes and keeps npm links available for deeper inspection.

## Data sources

- [npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) for package metadata, versions, and release dates.
- [npm downloads API](https://github.com/npm/registry/blob/main/docs/download-counts.md) for weekly counts and daily history.
- [npm search API](https://registry.npmjs.org/-/v1/search) for recommendations and related packages.

The component calls these public APIs from the browser. Requests have a timeout, and the UI reports unavailable data or API errors instead of remaining on an endless loading state.

## Run locally

Run these commands from the `package` folder, where `package.json` is located:

```bash
npm install
npm start
```

Open the local URL printed by Vite (normally `http://localhost:5173/`) for the HyperDart sandbox. The standalone Dart Frame is served at `/dep-signal`. The sandbox starts with a comparison query for Express and Fastify; `searchData.json` supplies mock query context only. Package details and download counts are fetched from npm at runtime.

Build the component with:

```bash
npm run build
```

Before publishing, add a real public GitHub repository URL and YouTube demo URL to `hyperdart.config.js`, create the package in the HyperDart Partner Portal, and configure the publish token. The `prepublishOnly` hook validates the build output, triggers, and both links during `npm publish`; it intentionally blocks publishing while either link is empty.

## Project structure

- `src/frontend/NewComponent.jsx` — package UI, factual comparisons, and render-error recovery.
- `src/frontend/packageData.js` — query parsing and browser-side npm API requests.
- `src/frontend/NewComponent.css` — scoped mainline, sidebar, and theme styles.
- `src/frontend/index.jsx` — component entry wrapped with `withHD`.
- `src/sandbox/`, `vite.config.js`, `index.html`, and `scripts/` — HyperDart local preview and publishing setup.
- `resource.json` — package-query schema used by HyperDart.

## AI assistance

Codex assisted with implementation and review against the supplied problem statement and HyperDart template. Before submission, the project owner should add any other AI tools used and describe their own contributions and changes.