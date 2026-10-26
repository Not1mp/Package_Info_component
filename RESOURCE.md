# NPM package query schema

`resource.json` describes the intent and entity collection used by the package component. Package names should resolve from HyperDart's `NPM_PACKAGES` collection (`HD_PACKAGES`). The component also accepts the raw query and works with array or object search-data payloads.

Supported intents:

- `details` for a single package's latest registry metadata.
- `comparison` for two or three package names.
- `alternatives` for related packages based on npm keywords.
- `recommendations` for an npm search based on a use case without a package name.

The `filters.packages` array carries package names, including scoped names such as `@tanstack/react-query`. `filters.package` is available for a single package and `filters.useCase` for a query such as `date formatting`. `features` can name requested facts such as version, downloads, license, TypeScript support, ESM metadata, Node.js range, or unpacked size.

The UI fetches live package data from npm. `searchData.json` is only a sample for the local HyperDart sandbox.
