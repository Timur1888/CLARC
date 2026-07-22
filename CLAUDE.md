# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **CLARC Billing App** — a SaaS SAPUI5/Fiori application for the CLARC ECM platform (by CTO Balzuweit GmbH). It's a single-page invoice/billing document viewer: a filterable master list of invoices (documenthub documents) and a two-column detail view (SAP FCL — flexible column layout) for viewing/editing an invoice, its PDF preview, attachments, send history, and sending it to a recipient.

The repo is an MTA (Multi-Target Application) for SAP BTP Cloud Foundry, composed of:
- `clarc-billing-app/` — the actual UI5 Fiori app (all frontend code lives here)
- `approuter/` — SAP standard `@sap/approuter` acting as the reverse proxy / auth gateway for the deployed app
- `mta.yaml` — deployment topology: destination content, HTML5 app-host/runtime, XSUAA, SaaS registry, UI5 flexibility service
- `xs-security.json` — XSUAA security profile (scopes/role templates) at the MTA level
- `workzone/cdm.json`, `resources/cdm.json` — Work Zone / content-delivery manifest fragments bundled into the deploy

There is no custom backend in this repo — the UI5 app talks to an external CLARC backend (documenthub, bpm/billing APIs) through the approuter's destinations, not through anything implemented here.

## Commands

All actual development happens inside `clarc-billing-app/`.

```bash
cd clarc-billing-app

npm start                 # run with Fiori Launchpad sandbox (test/flp.html#app-preview), proxies /application to the configured destination
npm run start-local        # same, but using ui5-local.yaml (SAPUI5 framework instead of ui5.yaml's CDN libs)
npm run start-noflp         # run without the FLP shell, straight index.html
npm run start-local-flex    # local run with view cache disabled, for testing UI5 flex/personalization

npm run build               # ui5 build --config=ui5.yaml --clean-dest --dest dist (plain preview build)
npm run build:cf            # ui5 build preload --clean-dest --config ui5-deploy.yaml --include-task=generateCachebusterInfo (the build the MTA uses)

npm run lint                 # eslint ./ (uses @sap-ux/eslint-plugin-fiori-tools recommended rules)

npm run unit-test            # opens test/unit/unitTests.qunit.html via fiori run
npm run int-test              # opens test/integration/opaTests.qunit.html via fiori run (OPA5 journeys)
```

There is no CLI-only/headless test runner configured — QUnit/OPA5 tests run in a browser opened by `fiori run`. There is only one real spec file (`test/unit/controller/View1.controller.js`); there's no way to run "a single test" other than opening the QUnit HTML runner, which runs the suite registered in `test/unit/AllTests.js`.

Top-level (repo root) MTA build/deploy commands (require `mbt` and Cloud Foundry CLI, and BTP access — do not run these without explicit user confirmation):

```bash
npm run build     # rimraf resources mta_archives && mbt build --mtar archive
npm run deploy     # cf deploy mta_archives/archive.mtar --retries 1
npm run undeploy   # cf undeploy CLARC --delete-services --delete-service-keys --delete-service-brokers
```

## Architecture

### Routing & layout
The app uses `sap.m.routing.Router` with FCL-style two-column layout (`App.view.xml`, `controlAggregation: beginColumnPages`/`midColumnPages`). Two routes:
- `RouteView1` (`""`) → the invoice list (`View1`), begin column
- `DetailsRoute` (`Details/{invoiceId}`) → invoice detail (`Details`), mid column

Layout state (`OneColumn` / `TwoColumnsBeginExpanded`) and a `openDetailsOnMatch` guard live in the `mainView` JSON model set up in `App.controller.js`. `openDetailsOnMatch` exists specifically so that a direct/refresh navigation to a `Details/...` URL bounces back to the list instead of opening the detail column (see `Details.controller.js#_onRouteMatched`).

### Models (all plain `sap.ui.model.json.JSONModel`, no OData)
Declared in `manifest.json` and initialized in `Component.js`:
- `backend` — holds the invoice list (`/value`) and the currently open invoice (`/CurrentInvoice`); this is the source of truth the whole app reads/writes against.
- `filterModel` — value-help lists (StatusList, SalesOrganisationList, InvoiceTypeList, ...) plus current user filter input; rebuilt from `billingConfig` in `Component.js#_rebuildFilter`.
- `billingConfig` — raw response of the billing config endpoint (`/application/api/v1/bpm/billing?...`), fetched once on component init.
- `auth` — placeholder token model (`tokenType`/`token`), not actively populated from a login flow in this codebase.
- View-local models created per-controller: `mainView` (App), `history`/`send`/`template`/`docCache` (Details).

There is no shared data/service layer beyond `util/Api.js`; each controller/util module calls `fetch()` directly against backend REST endpoints.

### Backend calls
All requests go through `util/Api.js#apiUrl(path)`, which just prefixes the app's own resource root (`sap.ui.require.toUrl(...)`) — the actual `/application/...` backend routing happens later, at the **approuter** layer (`xs-app.json` in both `approuter/` and `clarc-billing-app/`), which proxies `^/application/(.*)$` to the `CCI001_PRODUCTIVE_Auth2Credential` (or `CCI001_DEVELOPMENT_Auth2Credential` locally, see `ui5.yaml`/`ui5-local.yaml`) destination with XSUAA auth. Key endpoints used by the app:
- `GET /application/api/v1/bpm/billing?$expand=SalesOrgs&$filter=...` — billing config / sales orgs (`Component.js`)
- `GET /application/api/v1/documenthub/document?$select=...&$filter=...&$top=...&$orderby=...` — invoice list (`View1Helper.js`, `View1.controller.js#onSearch`)
- `PUT /application/api/v1/documenthub/document(<id>)` — save edited invoice metadata (`Details.controller.js#onSavePanel`)
- `POST /application/api/v1/documenthub/document(<id>)/appendblobs` — attach uploaded files (`util/Details_FilesUpload.js`)
- `POST /application/api/v1/bpm/billing(<billingId>)/sendinvoice` — send invoice to recipient (`Details.controller.js#onSendInvoice`)

Filter values coming from the UI's filter bar are hand-built into OData-style `$filter` strings server-side (see `View1.controller.js#onSearch` / `_buildUserFilter`), not composed via `sap.ui.model.Filter` sent through an ODataModel — there is no OData model in this app, filters are string-built for a custom REST query param.

### Details controller decomposition
`Details.controller.js` is intentionally thin and delegates most non-trivial logic to sibling modules under `util/`, all invoked as `Helper.fn(this, ...)` (passing the controller instance as first arg instead of binding):
- `Details_PDFViewHelper.js` — PDF/blob carousel preview logic (`sap.m.PDFViewer`)
- `Details_HistoryHelper.js` — loads/maps the invoice's send/processing history log
- `Details_FilesUpload.js` — `UploadSet` wiring for invoice/attachment files, persists via `appendblobs`
- `ImageDialogHelper.js` — image preview dialog for uploaded attachments

When modifying Details behavior, check whether the logic belongs in the controller (view lifecycle/state) or one of these helpers (a specific concern) — follow the existing split rather than growing `Details.controller.js` directly.

### View1 controller decomposition
Similarly, `View1.controller.js` delegates server paging/filtering to `util/View1Helper.js` (mixed in via `Object.assign({...}, View1Helper)` at controller `extend` time, so helper methods like `_loadInvoicesServer` are called as `this._loadInvoicesServer(...)`). The controller itself owns SmartVariantManagement (filter bar variants — `fetchData`/`applyData`/`getFiltersWithValues`), column visibility popover, and quick-sort menu wiring.

### i18n
Three bundles: `i18n/i18n.properties` (default/fallback = English), `i18n_de.properties`, `i18n_en.properties`. German is the primary/target language for this codebase (see `manifest.json` `supportedLocales: ["de", "en"]`, `fallbackLocale: "en"`) — a lot of controller code, log messages, and variable names are already in German; match that style in comments/strings you add to these files rather than switching to English-only.

### Config file relationship (easy to confuse)
- `ui5.yaml` — local dev-preview build (`npm run build`), points at `https://ui5.sap.com` for framework resources.
- `ui5-local.yaml` — local run using the actual `SAPUI5` framework (`fiori run --config ./ui5-local.yaml`), used by `start-local*` scripts and the "Local" VS Code launch config.
- `ui5-deploy.yaml` — the deployment build (`npm run build:cf`), invoked by `mta.yaml`'s `clarcbillingclarcbillingapp` module; adds the `ui5-task-zipper` task that zips `dist/` (plus `xs-app.json`) into `clarcbillingclarcbillingapp.zip`, which the MTA's `CLARC-app-content` module then uploads into the HTML5 app repo alongside `workzone/cdm.json`.
