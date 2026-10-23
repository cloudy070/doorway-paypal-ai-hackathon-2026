# Deployment package — prepared, not deployed

Prepared on **23 October 2026**. The production image has **not been built or run**: Docker CLI is installed on the development workstation, but its Linux daemon is unavailable. Docker Desktop was not started. No cloud resources, accounts, domains, webhooks, or purchases were created by preparing these files. Native production startup and application checks are separate evidence; they do not verify this Linux image or a hosted deployment.

## Approval gates

Do not apply the blueprint or publish the image until the responsible owner has approved the actual cloud cost, accounts, canonical HTTPS origin, sandbox credentials, data retention, and the following commercial dependency rights.

**AG Studio is currently used for local evaluation. That is not authorization to expose it to judges or customers.** Obtain written permission or a suitable licence covering this deployment, its AI features, and public reviewer access through **15 December 2026, 16:00 London**. Confirm the licence's actual scope and expiry with the licensor. The advertised trial does not by itself establish those rights or cover this whole window. See [AG Studio licensing](https://ag-grid.com/studio/license-pricing/) and the [licence terms](https://www.ag-grid.com/studio/licenses/ag-studio/LICENSE.html).

The Dockerfile deliberately stops before `next build` unless both of these are supplied:

- `DOORWAY_PUBLIC_HOSTING_APPROVED=true`: an explicit operator attestation that permission and the required budget/access approvals exist.
- `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY`: the actual appropriate licence key. A nonempty value is only a packaging check, not validation of its authenticity, permissions, or term. Never use a fabricated key to bypass the gate.

The AG key is a **public browser build input**. Changing it requires rebuilding the image. No server secret is declared as a Docker build argument. [Next.js documents this build-time behavior](https://nextjs.org/docs/app/guides/self-hosting#environment-variables).

## What the package runs

| Resource | Configuration | Durable state |
|---|---|---|
| Web | Linux Node 22; Next.js production server on `0.0.0.0:$PORT`, default port `10000` | PostgreSQL; no application data on container disk |
| Reconciliation worker | The same application image, separate `tsx scripts/worker.ts` process | Same PostgreSQL and signing configuration |
| Database | Paid PostgreSQL 17; proposed Render plan `0.5c-1g`, 1 GB storage; private network only | Orders, operations, sessions, inventory, receipts, audit and runs |

The proposed web and worker plans are each `0.5c-512mb`, with one instance apiece. They are an initial pilot configuration, not a measured capacity guarantee. All three resources use Frankfurt. The blueprint disables automatic deployments, previews and storage autoscaling. Applying it still creates **paid resources**; manual service creation/sync must wait for approval. Existing resources with matching blueprint names can be updated by a sync, so review names before use. The file was checked against Render's [current specification and JSON Schema](https://render.com/docs/blueprint-spec).

The Dockerfile builds dependencies inside Linux with pnpm **9.15.9** and the frozen lockfile. It uses the official `node:22-bookworm-slim` multi-platform image at the registry-verified digest `sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`. Review vulnerabilities and deliberately refresh that pin before deploying; a fixed digest does not receive automatic patches. [Docker explains digest pinning](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions).

Current `next.config.ts` does not enable standalone output, so this image includes the full build and installed dependencies. It also retains `tsx`, currently a devDependency, for the worker. There is no `public/` directory to copy. The image runs as the non-root `node` user. It bypasses `pnpm start`, whose repository default binds only to loopback. [Render requires an externally reachable bind address](https://render.com/docs/web-services#port-binding).

## Runtime values and shared identity

Supply values through the hosting secret store. Keep `.env.local`, `.data`, signing keys, test databases and local archives out of Docker context and Git. `.dockerignore` excludes them; the Dockerfile copies only declared app inputs.

| Variable | Web | Worker | Requirement |
|---|---|---|---|
| `NODE_ENV` | `production` | `production` | Required for production safeguards |
| `DATABASE_URL` | Internal database URL | Same database URL | Durable PostgreSQL; never the isolated test database |
| `APP_URL` | Exact canonical public HTTPS origin, no trailing slash | Same value | Origin checks, secure cookies, MCP endpoint and PayPal callbacks |
| `CHECKOUT_ACCESS_SECRET` | Stable random secret | Same value | Signs buyer checkout access links |
| `RECEIPT_PRIVATE_KEY` | Stable Ed25519 PKCS#8 PEM | Same key | Signs and verifies Doorway observations; literal `\n` is accepted |
| `RECONCILE_SECRET` | Stable random secret | Same value | Protects the optional HTTP worker trigger; standalone worker does not need to call it |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID` | Actual sandbox app and expected recipient | Same values | No live PayPal endpoint is implemented |
| `PAYPAL_WEBHOOK_ID` | ID of this sandbox app's webhook | Same value | Authenticated webhook verification |
| `ANTHROPIC_API_KEY` | Server-only key | Not provided | Required for extraction and shopping/analytics agents |
| `ANTHROPIC_MODEL` | Explicit approved model, currently `claude-sonnet-4-6` | Not needed | Revalidate model access and cost before use |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | Same build-time and runtime value | Same build input | Public licence material, not an AI API key |

The blueprint generates the checkout and HTTP reconciliation secrets once on the web service and references that service's values from the worker. The operator supplies one receipt private key. Preserve these values during rebuilds, redeploys and restores. Changing them silently can invalidate checkout links or old receipts. The current verifier uses the configured receipt key; key rotation requires an explicit compatibility/migration plan.

Create fresh deployment secrets in the approved secret manager. To create an Ed25519 key on a trusted administrative machine, `openssl genpkey -algorithm ED25519 -out receipt-key.pem` produces the required PEM format; protect that file and store its contents in the secret manager. Do not put it in this repository, an image, a build argument, or shell history. Back up the database and signing material together.

Render's `sync: false` entries prompt for values during initial blueprint creation. They are not a mechanism for updating secrets on later syncs; update the canonical web values deliberately, verify the worker references, and redeploy both services. The worker receives no Anthropic key. Render makes service environment values available as Docker build arguments, but this Dockerfile declares only the two intentional public/approval inputs. [Docker on Render](https://render.com/docs/docker#environment-variable-translation) describes the boundary.

## Database and worker operations

Use the database's internal connection string and a suitable TLS policy for the selected provider. The app uses the URL's PostgreSQL connection settings and does not add a separate TLS policy. Render's database is private-only in this blueprint. [Managed PostgreSQL setup and private connectivity](https://render.com/docs/postgresql-creating-connecting) should be reviewed by the operator.

Tables and indexes initialize on first database access, so the application database role currently needs DDL permission. No separate migration command is required by this revision. Do **not** run `pnpm db:setup` in the image: that script provisions a workstation-local database and writes local environment files. Do not automatically seed a hosted account, synthetic merchant, or credentials. Any explicitly requested fixture must remain labelled synthetic.

Keep one worker initially. It runs a reconciliation pass immediately and waits 30 seconds **after each completed pass**. It currently scans all checkouts sequentially, including historical records, so provider reads and duration grow with the dataset. It can recover retained create/refund operations; it does not approve or automatically capture a buyer's payment. The web and worker each allow up to eight database connections.

The worker has no inbound HTTP endpoint. Monitor its log timestamps, `checked`/`failed` counts, restarts and actual order recovery; a running process is not proof of successful reconciliation. Missing configuration is logged repeatedly rather than terminating the worker. Its shutdown may wait for a pass and a further sleep; the blueprint permits up to 300 seconds before termination. [Render background workers](https://render.com/docs/background-workers) are separate continuous processes.

## Build and start after approval

These commands are instructions for the responsible operator, not a record of execution. Use an already available Linux Docker daemon; do not start a desktop service or create cloud resources merely to validate the files.

```sh
# Only after real hosting rights, the actual licence and budget are approved:
docker build --build-arg DOORWAY_PUBLIC_HOSTING_APPROVED=true \
  --build-arg NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY \
  --tag doorway:reviewed .

# doorway.production.env is an access-controlled operator file outside the repo.
# It contains the runtime values above; it must not contain TEST_DATABASE_URL.
docker run --detach --name doorway-web --restart unless-stopped \
  --env-file /secure/path/doorway.production.env --publish 10000:10000 \
  doorway:reviewed

# Use an equivalent least-privilege worker env file, sharing DB/signing/payee/origin.
docker run --detach --name doorway-reconcile --restart unless-stopped \
  --env-file /secure/path/doorway.worker.env --stop-timeout 300 \
  doorway:reviewed node node_modules/tsx/dist/cli.mjs scripts/worker.ts
```

Before publishing ports, place the web container behind the approved HTTPS reverse proxy and configure request limits. The app has process-local rate limits; one web instance avoids pretending they are shared quotas. Do not add replicas until shared rate limits and operational capacity are reviewed. No Docker health command is attached to the common image because the worker serves no HTTP traffic.

## HTTPS, PayPal and readiness

1. Set the final `APP_URL` before onboarding stores or creating checkout links. Ensure the proxy preserves the browser's actual origin and supports the app's MCP HTTP route. Use the same canonical origin everywhere.
2. In the owner's PayPal **sandbox** application, create/configure the HTTPS webhook at `<APP_URL>/api/paypal/webhook` and supply its actual ID. Do not reuse a webhook ID from a different app/environment. The callback URLs include the specific checkout ID and a signed `access` capability. A PayPal redirect or webhook alone never proves payment.
3. For stores created before the sandbox recipient was configured, the owner explicitly uses **Connect configured sandbox merchant** in the store panel. Do not replace a stored recipient silently or treat this binding as PayPal account ownership verification.
4. Probe **`GET /api/status`**. It queries PostgreSQL and fails if that query fails. Its 200 response is a database/process check; payment/AI/webhook/licence flags indicate configuration presence, not valid credentials, legal permission, or completed acceptance. The probe shares the 600-request/minute per-process API limit and can return 429 under excessive traffic.
5. Complete [the reviewer path](REVIEWER.md), the real Anthropic/MCP checks, a human-approved sandbox checkout, authenticated capture/order/amount/currency/payee reads, webhook verification/replay checks, signed-receipt verification and separate recovery/refund acceptance. Check the worker's observed recovery of an existing operation. Preserve failures and source labels in the evidence registry. Passing a health check, native build, schema check, or synthetic test does not close these hosted gates.

Keep checkout capability URLs, API credentials, private keys and buyer data out of public logs and submissions. Hostnames, keys, webhook IDs and reviewer access in these instructions are placeholders until configured and verified. No hosted URL or successful deployment is claimed here.

## Budget and availability through judging

Obtain a cost approval covering availability through **15 December 2026, 16:00 London**, backups and a recovery margin. From this preparation date that is roughly 53 days. Record the provider's current quoted amounts for **two service instances + PostgreSQL compute/storage + builds + egress + monitoring/backups + Anthropic usage + AG Studio rights + applicable tax/currency charges**. Recheck [Render pricing](https://render.com/pricing) and the operator's actual checkout quote; no dollar total or purchased credit is assumed here.

The blueprint uses paid plans because free web services can sleep and free Render PostgreSQL expires after 30 days. [Render's free-instance limits](https://render.com/docs/free) do not fit the required availability window. Approve a concrete spending ceiling, provider alerts and available AI usage limits before provisioning. Review worker provider-read volume and model runs daily during testing; current application limits are not an account-wide spending cap. Review backup restore and licence expiry before feature freeze, retain reviewer access until the required date, and schedule teardown only after the owner confirms judging access can end.

## Validation record and remaining checks

- Official Render schema used: `https://render.com/schema/render.yaml.json`, fetched on 23 October 2026. The complete YAML is checked locally against that schema; this is structural validation, not a Render account/workspace or capacity check.
- Official Node image's multi-platform manifest/digest was resolved from the Docker registry. No image version or digest was invented.
- Docker daemon check failed because the Linux engine pipe was absent. **No image build, Linux container start, Docker health check or hosted acceptance was performed.** No cloud API validation requiring credentials was called.
- The prepared image intentionally remains gated until the hosting/licence approval inputs exist. The web service and worker must still be built, started, monitored and tested with the same stable configuration after approval.

To repeat structural validation without an account, use Python with the already installed `PyYAML` and `jsonschema` libraries:

```sh
python -c "import json,urllib.request,yaml,jsonschema; from pathlib import Path; s=json.load(urllib.request.urlopen('https://render.com/schema/render.yaml.json')); v=yaml.safe_load(Path('render.yaml').read_text()); C=jsonschema.validators.validator_for(s); C.check_schema(s); C(s).validate(v); print('Render schema: PASS')"
```

Also run `git diff --check`, review the Docker context exclusions, and rerun the application's clean-checkout tests/build after any source or dependency change. A successful schema check does not authorize deployment.
