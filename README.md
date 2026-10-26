# Package Info Component 

Package Info Component is a HyperDart component that helps developers understand npm packages. Ask about a package in everyday language and it shows useful facts, compares packages, or finds related options.

This project was built for the requirements in the **Package Info Component - Hackathon Problem Statement (v2)**.

## What it can do

- **Show package details:** latest version, release date, weekly downloads, license, deprecation status, TypeScript support, ESM metadata, Node.js requirement, and unpacked size.
- **Compare packages:** compare two or three packages in a facts table, view daily downloads for the last month when available, and see factual highlights from the data.
- **Find alternatives:** search npm for packages related to a named package and show shared keywords and download counts when available.
- **Find packages for a task:** search npm for a use case such as "best npm package for date formatting".
- **Continue from the result:** open package details, see alternatives, or add a package to a comparison without starting from scratch.

The component reports missing data as unavailable. Download counts describe install activity; they do not prove that a package is better or higher quality.

## How it works

1. HyperDart provides the component with the user's query and any package entities it recognized.
2. The component figures out whether the user wants package details, a comparison, alternatives, or use-case recommendations.
3. It requests current package information from the public npm services listed below.
4. It turns the response into package cards, comparison facts, a download chart, or a list of search results.
5. If a package is missing or a service is unavailable, the component displays an error or marks the data as unavailable instead of inventing a value.

Package data is fetched in the browser. No npm API key is needed. Requests have a time limit, and the component handles common failures such as unknown packages, network problems, and rate limits.

## Design choices

The screen is designed to answer the query quickly, then let the user explore more. Package facts are grouped into cards; comparisons use a table and a download chart. The component supports both HyperDart mainline and sidebar layouts, plus light and dark themes. It uses a restrained visual style and keeps links to npm and package websites available.

The UI reports facts from npm data. It does not invent an overall score or name a package as the winner based on downloads alone.

## Data sources

- **npm Registry API** for package descriptions, versions, release dates, license, compatibility metadata, repository links, and package size: [Registry API documentation](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)
- **npm Downloads API** for weekly counts and daily download history: [Download counts documentation](https://github.com/npm/registry/blob/main/docs/download-counts.md)
- **npm Search API** for alternatives and use-case search results: `https://registry.npmjs.org/-/v1/search`

These are public services. Their data can be incomplete, delayed, or temporarily unavailable. The app shows unavailable values when that happens.

## Libraries and tools

- **React** builds the user interface.
- **HyperDart Frontend** connects the component to HyperDart.
- **HyperDart Sandbox** runs the local preview.
- **Vite** starts the development server and builds the package.
- **CSS** styles the component, including responsive layouts and themes.

## Run the project locally

You need Node.js and npm installed. Open a terminal in the `package` folder, the folder containing `package.json`, then run:

```bash
npm install
npm start
```

Open the local address printed by Vite. It is usually `http://localhost:5173/`. The sandbox starts with sample search data for an Express and Fastify comparison. The sample in `searchData.json` provides query context; live package facts come from npm when the component runs.

To make a production build, run:

```bash
npm run build
```

## Try these searches

- `npm express`
- `latest version of react`
- `compare express and fastify`
- `compare react, vue, and svelte`
- `npm alternatives to moment`
- `best npm package for date formatting`
- `npm request`

## Project files

- `hyperdart.config.js` - package identity, trigger keywords, query patterns, and HyperDart display settings.
- `resource.json` - describes supported query types and package information for HyperDart.
- `searchData.json` - sample input for the local sandbox.
- `src/frontend/index.jsx` - wraps the component with HyperDart's `withHD` helper.
- `src/frontend/NewComponent.jsx` - renders package details, comparisons, charts, alternatives, and recommendations.
- `src/frontend/packageData.js` - reads HyperDart input, identifies the query type, and requests npm data.
- `src/frontend/NewComponent.css` - component styling, themes, and responsive layouts.
- `src/sandbox/` - local HyperDart preview.
- `scripts/validate-publish.js` - checks required package, build, and link settings before publishing.

## Before submitting

The hackathon brief asks for a public GitHub repository, a package published to the HyperDart development registry, and a 2-3 minute YouTube demo. Add the real GitHub repository URL and demo video URL to the `github` and `demovideo` fields in `hyperdart.config.js`. The publish check requires both links and a successful build. Create the package in the HyperDart Partner Portal and set the publish token there before running `npm publish`.

Do not commit your publish token or other secrets. The `.gitignore` excludes `node_modules`, `dist`, and `.env` files.

## AI assistance and author contributions

OpenAI Codex assisted with reviewing the project against the problem statement, troubleshooting the preview, refining the CSS, and preparing this README. Before submitting, add a truthful note about your own design, coding, and testing contributions, and name any other AI tools you used.

