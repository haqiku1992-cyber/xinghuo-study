# Dependency security review — 2026-10-26

Scope: PR #20, branch `security/next-oct-2026`, based on `007e4c4cceb132e580e2190069d3096da5f15cdc`. Node 24.16.0 / npm 11.13.0. Reports are npm registry advisory snapshots, not a claim of exhaustive security assurance.

## Changes and verification

- Exact pins: vinext 0.0.55, @vitejs/plugin-rsc 0.5.27, Vite 8.1.6 (the first version outside every Vite advisory range returned in this audit). Existing Next 16.4.3, React/RSC 19.2.9, sharp 0.35.5 and sharp override preserved.
- Lockfile generated only by normal npm 11.13.0 install/update commands. Targeted transitive updates respect parent semver ranges; no audit fix or force used.
- vinext peer ranges: Vite ^7 || ^8; plugin-react ^5.1.4 || ^6; plugin-rsc ^0.5.26; React/DOM/RSC ^19.2.6. Installed peers pass npm ls without invalid/missing peers. Optional MDX peer unused.
- [Official v0.0.55 source](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/server/static-file-cache.ts) normalizes path.relative() before forming cache keys. The installed npm package contains the same fix. The [release page](https://github.com/cloudflare/vinext/releases/tag/v0.0.55) lists plugin-rsc 0.5.27; its currently returned text does not explicitly mention Windows static caching, so source and actual HTTP responses are the decisive evidence.
- Windows: npm ci, npm run lint, npm test pass; 53 tests, including the production smoke test. Actual HTML references 6 JS files and 1 CSS file; every URL returns 200, nonempty bytes and the expected MIME type. Temporary missing-CSS negative control fails on asset HTTP status and emits server logs, then restores the file.
- Smoke test runs after npm test's production build, binds a temporary loopback port, starts the installed vinext start CLI, parses real script/link URLs, requires both JS and CSS, and kills/awaits the process tree in finally on success or failure. No extra test dependency.
- GitHub Actions runs npm ci, lint and npm test separately on ubuntu-latest/windows-latest with Node 24.16.0 and npm 11.13.0. Actual run evidence is recorded in the PR after push.

## Audit result and decisions

After vinext/plugin-rsc upgrade: **17 affected package entries (11 high, 4 moderate, 2 low)**. After compatible targeted updates: **7 (4 high, 2 moderate, 1 low), 0 critical**. Counts are npm package entries, not unique advisory IDs: vinext, miniflare and wrangler inherit findings from children.

All remaining affected entries below are marked dev by npm because they descend from devDependencies. Dependency labels alone do not establish exposure: vinext is the production server, but the verified image-size calls in 0.0.55 process local images during metadata entry generation and Vite image-import processing, not production HTTP image requests (see the image-size evidence below); fflate is in its OG rendering tree. Wrangler/Miniflare are local Cloudflare development/deployment tooling, Vite/Babel/browser mapping/source maps are build/development tooling, and ESLint descendants are lint tooling. Do not expose dev servers to untrusted networks or process untrusted build inputs pending fixes.

### Deferred changes

- **image-size 2.0.2 / vinext (high, unresolved):** individual parser advisories are fixed in image-size 2.0.3 (2.0.4 also available). vinext 0.0.55 pins exactly 2.0.2; an override would bypass that exact dependency constraint and still needs compatibility validation. npm proposes vinext 1.3.1, a major migration that conflicts with this PR's required 0.0.55 pin. Follow up separately: evaluate a narrowly scoped image-size 2.0.4 override with static metadata and local image-import compatibility tests plus malformed JXL, HEIF and ICNS parser regressions, or migrate vinext after reviewing its API/runtime changes. Untrusted local images entering metadata generation or image-import processing can still threaten build/development availability; build-time execution does not make these high-severity findings harmless. Static asset HTTP tests do not validate these parsers. This documentation correction does not fix either advisory or change the recorded npm audit result.
- **Wrangler 4.92.0 → Miniflare 4.20260515.0 → undici 7.24.8 / ws 8.18.0**, and **Wrangler → esbuild 0.27.3**: parent pins prevent ordinary compatible child refresh. Individual fixed boundaries: undici 7.30.1, ws 8.21.0, esbuild 0.28.1. npm's available parent fix is Wrangler 4.153.0 (same major, 61 minor releases ahead). This is an available compatible-major candidate, not proven safe by the app's Node production-server smoke test. Defer Cloudflare tooling changes; follow up with configuration review and Wrangler local-worker/build/dry-run regression tests before choosing a pinned parent version. Avoid overriding exact Miniflare/workerd/tooling pairs independently. No deployment is required for that follow-up.

### Per-package evidence and advisory IDs

Representative shortest paths per immediate parent below come from npm explain after updates (peer-induced duplicate routes omitted); original vulnerable installed versions come from the base lockfile. Each advisory includes the registry numeric ID, GHSA link, affected range, and fixed boundary. For a `<=x` range, `>x` is a boundary rather than an assertion that an arbitrary next patch exists. Resolved package versions are explicitly listed.

#### @babel/core — resolved

Base: 7.29.0; current: 7.29.7. Initial severity: low. Use: development / build / lint.

- root → eslint-config-next@16.4.3 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.7

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1123528 / [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | low | <=7.29.0 | >7.29.0 |

#### baseline-browser-mapping — resolved

Base: 2.10.30; current: 2.11.33. Initial severity: moderate. Use: production Next dependency and development build tooling.

- root → react-server-dom-webpack@19.2.9 → webpack@5.106.2 → browserslist@4.29.4 → baseline-browser-mapping@2.11.33
- root → next@16.4.3 → baseline-browser-mapping@2.11.33

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1193686 / [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | moderate | >=2.0.0 <2.11.0 | >=2.11.0 |

#### brace-expansion — resolved

Base: 5.0.6, 1.1.14; current: 5.0.12, 1.1.21. Initial severity: high. Use: development / build / lint.

- root → eslint@9.39.4 → minimatch@3.1.5 → brace-expansion@1.1.21
- root → eslint-config-next@16.4.3 → typescript-eslint@8.59.3 → @typescript-eslint/typescript-estree@8.59.3 → minimatch@10.2.5 → brace-expansion@5.0.12

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1123897 / [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | <1.1.16 | >=1.1.16 |
| 1123898 / [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | >=3.0.0 <5.0.7 | >=5.0.7 |
| 1130588 / [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | <1.1.17 | >=1.1.17 |
| 1130591 / [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | >=4.0.0 <5.0.8 | >=5.0.8 |
| 1130734 / [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | >=4.0.0 <5.0.9 | >=5.0.9 |
| 1130737 / [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | <1.1.18 | >=1.1.18 |
| 1240100 / [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | <1.1.21 | >=1.1.21 |
| 1240103 / [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | >=4.0.0 <5.0.12 | >=5.0.12 |
| 1240104 / [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | <1.1.20 | >=1.1.20 |
| 1240107 / [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | >=4.0.0 <5.0.11 | >=5.0.11 |
| 1240108 / [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | <1.1.19 | >=1.1.19 |
| 1240111 / [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | >=4.0.0 <5.0.10 | >=5.0.10 |

#### browserslist — resolved

Base: 4.28.2; current: 4.29.4. Initial severity: high. Use: development / build / lint.

- root → react-server-dom-webpack@19.2.9 → webpack@5.106.2 → browserslist@4.29.4
- root → eslint-config-next@16.4.3 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.7 → @babel/helper-compilation-targets@7.29.7 → browserslist@4.29.4

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1153171 / [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | high | <=4.28.6 | >4.28.6 |
| 1153172 / [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | high | <=4.28.6 | >4.28.6 |

#### esbuild — remaining: low

Base: 0.27.3; current: 0.27.3. Initial severity: low. Use: development / Cloudflare tooling.

- root → wrangler@4.92.0 → esbuild@0.27.3

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1120680 / [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | low | >=0.27.3 <0.28.1 | >=0.28.1 |

#### fast-uri — resolved

Base: 3.1.2; current: 3.1.9. Initial severity: high. Use: development / build / lint.

- root → react-server-dom-webpack@19.2.9 → webpack@5.106.2 → schema-utils@4.3.3 → ajv@8.20.0 → fast-uri@3.1.9

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1124064 / [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | high | >=3.0.0 <=3.1.3 | >3.1.3 |
| 1130720 / [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | high | >=3.0.0 <3.1.5 | >=3.1.5 |
| 1158524 / [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | high | >=3.0.0 <3.1.6 | >=3.1.6 |
| 1158527 / [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | high | >=3.1.2 <3.1.6 | >=3.1.6 |
| 1158530 / [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | high | >=3.0.0 <3.1.6 | >=3.1.6 |
| 1204921 / [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | high | >=3.0.0 <3.1.3 | >=3.1.3 |
| 1239943 / [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | high | >=3.0.0 <3.1.7 | >=3.1.7 |
| 1240091 / [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | >=3.0.0 <3.1.8 | >=3.1.8 |
| 1243098 / [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | moderate | >=3.0.0 <3.1.9 | >=3.1.9 |
| 1243101 / [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | low | >=3.0.0 <3.1.9 | >=3.1.9 |
| 1243107 / [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | low | >=3.0.0 <3.1.9 | >=3.1.9 |

#### fflate — resolved

Base: 0.7.4; current: 0.7.5. Initial severity: moderate. Use: dev-classified; production vinext runtime/OG tree.

- root → vinext@0.0.55 → @vercel/og@0.8.6 → satori@0.16.0 → @shuding/opentype.js@1.4.0-beta.0 → fflate@0.7.5

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1164783 / [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) | moderate | >=0.7.0 <0.7.5 | >=0.7.5 |

#### image-size — remaining: high

Base: 2.0.2; current: 2.0.2. Initial severity: high. Use: dev-classified; local static metadata dimension extraction and Vite local image-import processing during build/development. No image-size invocation was found in the inspected 0.0.55 production HTTP image handlers; this is a call-path finding, not a conclusion drawn from the devDependency label.

- root → vinext@0.0.55 → image-size@2.0.2

Call-path evidence checked against the official v0.0.55 tag and installed npm package on 2026-10-27:

- [server/metadata-route-build-data.ts](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/server/metadata-route-build-data.ts): `createMetadataRouteEntryData()` reads a local metadata file; for static image routes, `readStaticMetadataImageDimensions()` calls `readMetadataImageDimensions()` → `imageSize(buffer)`. Dynamic routes return before this dimension extraction. [entries/app-rsc-manifest.ts](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/entries/app-rsc-manifest.ts) calls `createMetadataRouteEntriesSource()` while generating the RSC entry/manifest source, embedding head data and static file bytes for subsequent serving. This is metadata source generation during build/development, not image-size parsing a production HTTP request body or remote image URL.
- The requested `plugins/worker-image-imports.ts` is absent from the official v0.0.55 tag; a separate Worker plugin at that path cannot be verified for this version. The actual local image-import implementation is the inline `vinext:image-imports` Vite plugin in [src/index.ts](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/index.ts). Its `load()` hook handles a `vinext-image-meta` virtual module, reads a local image and calls `imageSize()` to emit width/height values. These are build/development plugin operations (including image imports processed when building a Worker), not a deployed Worker request handler. The installed `dist/index.js` contains the same call. The project's Vite configuration uses `vinext()` and application source has no direct image-size import; this does not exempt future or externally supplied build assets from validation.
- [server/image-optimization.ts](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/server/image-optimization.ts): `handleImageOptimization()` validates parameters/content types and delegates to `fetchAsset` and optional `transformImage` callbacks; it does not import or call image-size. [server/prod-server.ts](https://github.com/cloudflare/vinext/blob/v0.0.55/packages/vinext/src/server/prod-server.ts) handles the Node production image endpoint by validating the URL/content type and serving the original file through `tryServeStatic()`, without image-size dimension parsing. Arbitrary application-provided transform callbacks are outside this verified upstream path; no claim is made that every possible custom handler is safe.
- The two high-severity advisories below remain open. Their malformed-input/infinite-loop risk must be assessed wherever affected image bytes reach the verified metadata/import parsers. Ordinary exception handling does not bound an infinite loop; follow-up tests need an isolated process with a timeout. No dependency or parser remediation was performed in this documentation-only change.

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1239765 / [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) | high | >=1.2.0 <=2.0.2 | >2.0.2 |
| 1239766 / [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | high | >=0.6.3 <=2.0.2 | >2.0.2 |

#### js-yaml — resolved

Base: 4.1.1; current: 4.3.2. Initial severity: high. Use: development / build / lint.

- root → eslint@9.39.4 → @eslint/eslintrc@3.3.5 → js-yaml@4.3.2

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1121860 / [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | moderate | >=4.0.0 <=4.1.1 | >4.1.1 |
| 1123911 / [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | high | >=4.0.0 <4.3.0 | >=4.3.0 |
| 1138115 / [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | high | >=4.0.0 <4.3.1 | >=4.3.1 |
| 1193727 / [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | high | >=4.0.0 <4.3.2 | >=4.3.2 |

#### miniflare — remaining: moderate

Base: 4.20260515.0; current: 4.20260515.0. Initial severity: moderate. Use: development / Cloudflare tooling.

- root → wrangler@4.92.0 → miniflare@4.20260515.0

Inherited from: undici, ws; no independent advisory ID. npm parent fix candidate: {"name":"wrangler","version":"4.153.0","isSemVerMajor":false}. See child rows for IDs and fixed versions.

#### source-map-js — resolved

Base: 1.2.1; current: 1.2.2. Initial severity: high. Use: development / build / lint.

- root → vite@8.1.6 → postcss@8.5.23 → source-map-js@1.2.2
- root → @tailwindcss/postcss@4.2.1 → @tailwindcss/node@4.2.1 → source-map-js@1.2.2

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1241209 / [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | >=1.0.0 <1.2.2 | >=1.2.2 |

#### undici — remaining: high

Base: 7.24.8; current: 7.24.8. Initial severity: high. Use: development / Cloudflare tooling.

- root → wrangler@4.92.0 → miniflare@4.20260515.0 → undici@7.24.8

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1121187 / [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g) | high | >=7.23.0 <7.28.0 | >=7.28.0 |
| 1121241 / [GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv) | moderate | >=7.0.0 <7.28.0 | >=7.28.0 |
| 1121244 / [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) | high | >=7.0.0 <7.28.0 | >=7.28.0 |
| 1121247 / [GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) | high | >=7.23.0 <7.28.0 | >=7.28.0 |
| 1121254 / [GHSA-g8m3-5g58-fq7m](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) | low | >=7.0.0 <7.28.0 | >=7.28.0 |
| 1121428 / [GHSA-pr7r-676h-xcf6](https://github.com/advisories/GHSA-pr7r-676h-xcf6) | moderate | >=7.0.0 <7.28.0 | >=7.28.0 |
| 1130715 / [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) | moderate | >=7.0.0 <7.29.0 | >=7.29.0 |
| 1130718 / [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) | high | >=7.0.0 <7.29.0 | >=7.29.0 |
| 1130726 / [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) | moderate | >=7.0.0 <7.29.0 | >=7.29.0 |
| 1130729 / [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) | moderate | >=7.0.0 <7.29.0 | >=7.29.0 |
| 1130731 / [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) | moderate | >=7.0.0 <7.29.0 | >=7.29.0 |
| 1137242 / [GHSA-35p6-xmwp-9g52](https://github.com/advisories/GHSA-35p6-xmwp-9g52) | low | >=7.0.0 <7.28.0 | >=7.28.0 |
| 1240036 / [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | moderate | >=7.11.0 <7.29.1 | >=7.29.1 |
| 1240038 / [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | low | >=7.0.0 <7.29.1 | >=7.29.1 |
| 1240041 / [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | high | >=7.0.0 <7.29.1 | >=7.29.1 |
| 1240044 / [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | moderate | >=7.15.0 <7.29.1 | >=7.29.1 |
| 1240046 / [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | moderate | >=7.0.0 <7.29.1 | >=7.29.1 |
| 1240048 / [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | low | >=7.1.0 <7.29.1 | >=7.29.1 |
| 1240050 / [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | high | >=7.24.1 <7.29.1 | >=7.29.1 |
| 1240052 / [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | low | >=7.0.0 <7.29.1 | >=7.29.1 |
| 1240055 / [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | moderate | >=7.0.0 <7.29.1 | >=7.29.1 |
| 1243078 / [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | moderate | >=7.0.0 <7.30.1 | >=7.30.1 |
| 1243081 / [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | moderate | >=7.15.0 <7.30.1 | >=7.30.1 |
| 1243113 / [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | high | >=7.18.0 <7.30.1 | >=7.30.1 |

#### vinext — remaining: high

Base: 0.0.50; current: 0.0.55. Initial severity: high. Use: dev-classified; vinext is the production server, but this inherited finding comes from the image-size metadata/build-plugin paths described above, not an established production HTTP parser call.

- root → vinext@0.0.55

Inherited from: image-size; no independent advisory ID. npm parent fix candidate: {"name":"vinext","version":"1.3.1","isSemVerMajor":true}. See child rows for IDs and fixed versions.

#### vite — resolved

Base: 8.0.13; current: 8.1.6. Initial severity: high. Use: development / build / lint.

- root → vite@8.1.6
- root → vinext@0.0.55 → vite@8.1.6
- root → vinext@0.0.55 → vite-tsconfig-paths@6.1.1 → vite@8.1.6
- root → @vitejs/plugin-rsc@0.5.27 → vitefu@1.1.3 → vite@8.1.6
- root → @vitejs/plugin-react@6.0.2 → vite@8.1.6
- root → @vitejs/plugin-rsc@0.5.27 → vite@8.1.6

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1120786 / [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | >=8.0.0 <=8.0.15 | >8.0.15 |
| 1123527 / [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | high | >=8.0.0 <=8.0.15 | >8.0.15 |
| 1242624 / [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | moderate | >=8.0.0 <=8.1.5 | >8.1.5 |
| 1242653 / [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | moderate | >=8.0.0 <=8.1.5 | >8.1.5 |
| 1242660 / [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | high | >=8.0.0 <=8.1.5 | >8.1.5 |
| 1242726 / [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | low | >=8.0.0 <=8.1.5 | >8.1.5 |
| 1242732 / [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | moderate | >=8.0.0 <=8.1.5 | >8.1.5 |

#### wrangler — remaining: moderate

Base: 4.92.0; current: 4.92.0. Initial severity: moderate. Use: development / Cloudflare tooling.

- root → wrangler@4.92.0

Inherited from: esbuild, miniflare; no independent advisory ID. npm parent fix candidate: {"name":"wrangler","version":"4.153.0","isSemVerMajor":false}. See child rows for IDs and fixed versions.

#### ws — remaining: high

Base: 8.18.0; current: 8.18.0. Initial severity: high. Use: development / Cloudflare tooling.

- root → wrangler@4.92.0 → miniflare@4.20260515.0 → ws@8.18.0

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1119108 / [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | moderate | >=8.0.0 <8.20.1 | >=8.20.1 |
| 1123259 / [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | high | >=8.0.0 <8.21.0 | >=8.21.0 |

#### zod — resolved

Base: 4.4.3; current: 4.6.7. Initial severity: high. Use: development / build / lint.

- root → eslint-config-next@16.4.3 → eslint-plugin-react-hooks@7.1.1 → zod@4.6.7
- root → eslint-config-next@16.4.3 → eslint-plugin-react-hooks@7.1.1 → zod-validation-error@4.0.2 → zod@4.6.7

| Registry ID / advisory | Severity | Affected versions | Fixed boundary |
| --- | --- | --- | --- |
| 1243066 / [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | high | <4.6.6 | >=4.6.6 |

