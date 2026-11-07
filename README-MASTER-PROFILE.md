# RCL Maker — Master Profile + Signature + Claude Skill

This package adds persistent candidate profiles and per-candidate signatures to the existing RCL Maker project. It preserves the existing Resume, CV, Cover Letter, PDF, and DOCX generator endpoints.

## Final user experience

- `/rcl-maker-assistant`: dashboard showing the five approved categories and all commands.
- `/help`: full guide for all commands and categories in one response.
- `/status`: MCP, Supabase, active profile, and profile count.
- Profile operations use Supabase as the source of truth.
- Each profile has its own private signature file.
- An explicitly identified signature image sent in Claude chat targets the active profile automatically. Because Claude Connectors may not forward raw attachment bytes to MCP tool arguments, the implementation provides a one-time private upload page as the reliable mobile/desktop fallback.
- Cover Letter generation loads the signature server-side from the exact selected profile UUID. It never accepts another candidate's signature from the document payload.
- Profile edits overwrite the latest `profile_data`; no profile version/history is stored.
- Creating a second profile does not change the active profile.

## Package contents

- `sql/supabase-master-profile.sql` — database tables, triggers, and private Storage buckets.
- `claude-skill/SKILL.md` — final RCL Maker Assistant command catalog and behavior.
- `mcp-server/src/supabase.js` — server-only Supabase client.
- `mcp-server/src/profile-service.js` — profile CRUD, active profile, and signature services.
- `mcp-server/src/profile-tools.js` — MCP tools for profile and signature operations.
- `mcp-server/src/mcp.js` — registers the profile tools and system status while preserving document generation.
- `public/signature-upload.html` — mobile/desktop upload page for a private one-time signature upload link.
- `server.js` — one-time upload endpoint that validates the token and image, writes to private Storage, and updates only the intended candidate profile.

## Important deployment model

The supplied repository already has a Vercel serverless MCP entry at `api/mcp.js` and an Express API forwarded by `api/[...path].js`. Deploy the **whole repository to the existing RCL Maker Vercel project**. Do not deploy only `mcp-server/` as a separate production app unless you intentionally configure that standalone service.

The root `package.json` already includes `@modelcontextprotocol/sdk` and `@supabase/supabase-js`, which the Vercel project uses. The `mcp-server/package.json` is for local/standalone MCP development.

## Step 1 — Back up and apply SQL

1. Open Supabase → SQL Editor.
2. Back up/export the existing database first.
3. Open `sql/supabase-master-profile.sql`.
4. Review the `generated_documents` section. If that table already exists, compare its columns with the SQL and current `mcp-server/src/temp-storage.js` before running. `CREATE TABLE IF NOT EXISTS` does not alter an existing table.
5. Run the SQL.

The SQL creates:
- `candidate_profiles`
- `mcp_user_settings`
- `signature_upload_tokens`
- `generated_documents` if it does not already exist
- private Storage buckets `profile-signatures` and `generated-documents`

RLS is enabled. The server-side service-role key is used only by backend code. No public Storage policies are created.

## Step 2 — Configure Vercel environment variables

In the existing RCL Maker Vercel project, add:

```dotenv
MCP_API_KEYS=YOUR_LONG_RANDOM_TOKEN:owner
RCL_API_BASE_URL=https://YOUR-RCL-MAKER-DOMAIN.vercel.app
RCL_API_TIMEOUT_MS=90000

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BUCKET=generated-documents
SUPABASE_SIGNATURE_BUCKET=profile-signatures
```

`SUPABASE_SERVICE_ROLE_KEY` must remain server-side. Never add it to `public/`, browser JavaScript, or a `VITE_` variable.

For a personal single-user setup, `owner` is the account ID derived from the API key. For multiple controlled users, configure distinct keys and distinct IDs, for example:

```dotenv
MCP_API_KEYS=TOKEN_ALIEF:alief,TOKEN_BUDI:budi
```

Do not give unrelated people the same key/user ID. The current API-key identity is suitable for a private/controlled setup; public self-service multi-user access needs a proper account provisioning/authentication design.

## Step 3 — Deploy the full project

1. Copy the modified files from this package into the matching locations in your existing RCL Maker repository.
2. Keep the original files not listed in this patch.
3. Commit/push the project.
4. Redeploy the existing Vercel project.
5. Confirm:
   - `https://YOUR-DOMAIN/api/health` returns `{"status":"ok"}`.
   - `https://YOUR-DOMAIN/signature-upload.html` opens the upload page (without a token it cannot upload).
   - `https://YOUR-DOMAIN/api/mcp` is reachable with the configured bearer key.

## Step 4 — Install the Skill in Claude

1. Open Claude's Skills settings.
2. Create/import a Skill using `claude-skill/SKILL.md`.
3. Enable the Skill.
4. Ensure the RCL Maker MCP connector is connected to `https://YOUR-DOMAIN/api/mcp` with the matching bearer token.
5. Reconnect/refresh the connector after deploying MCP changes so the new tools are discovered.

The Skill is an instruction layer. Claude Web may interpret typed `/...` commands as text; they are not guaranteed to appear as native slash-command autocomplete.

## Step 5 — Test in this order

### A. MCP discovery
Confirm the tools are available:
- `list_profiles`
- `get_active_profile`
- `get_profile`
- `create_profile`
- `update_profile`
- `delete_profile`
- `set_active_profile`
- `set_profile_signature`
- `get_profile_signature`
- `create_signature_upload_link`
- `get_system_status`
- `list_templates`
- `get_document_schema`
- `generate_pdf`
- `generate_docx`

### B. Profile isolation
1. Create dummy profile `Alief Test`.
2. Create dummy profile `Budi Test`.
3. Confirm both IDs differ.
4. Set `Alief Test` active.
5. Create Budi again only if it does not already exist; verify creating a profile does not change active selection.
6. Switch to Budi and open a new Claude chat. `/profile` should still report Budi active.
7. Edit Budi and confirm Alief remains unchanged.

### C. Signature isolation
1. Activate Alief.
2. Send the explicit message “Ini tanda tangan Alief, simpan untuk Cover Letter.”
3. Claude should call `get_profile_signature`. If one exists, it must ask before replacement.
4. Claude calls `create_signature_upload_link` for the active profile and returns a private 15-minute link.
5. Open the link on a phone or desktop, select a PNG/JPEG up to 512 KB, and upload.
6. Return to Claude and run `/cek-ttd`; it should show an uploaded signature for Alief.
7. Repeat for Budi and verify the signature metadata points to Budi's profile, not Alief's.

### D. Document generation
1. Generate a Cover Letter for Alief and pass Alief's exact profile UUID as `profileId`.
2. Generate a Cover Letter for Budi and pass Budi's UUID.
3. Confirm each document uses only its own signature.
4. Generate CV and Resume PDF; then request DOCX and confirm download links.
5. If a candidate has no signature, the Cover Letter should use the manual signing space.

## Signature upload behavior

`create_signature_upload_link` creates a cryptographically random 15-minute token. Only its SHA-256 hash is stored in `signature_upload_tokens`. The upload page sends the original file to `/api/signature-upload/:token`; the backend:
- validates token, expiry, and one-time use;
- checks the candidate belongs to the token's authenticated account;
- validates PNG/JPEG file signature and 512 KB size limit;
- writes the file to the private `profile-signatures` bucket;
- updates only that candidate's `profile_data.signature`;
- removes the previous signature file after successful metadata update.

The upload URL is a bearer secret. Do not forward it to other people. If it expires or is consumed, ask Claude to create a new link.

## Current limitations

- Direct Claude chat attachment-to-MCP binary forwarding is not guaranteed by the MCP Connector interface. The Skill therefore uses the private upload page when it cannot pass actual file bytes. This still works from mobile and desktop without running a conversion script.
- The existing browser-only `localStorage` profile editor in the RCL Maker website is not yet synchronized with `candidate_profiles`. This package enables Claude/MCP Master Profiles and signature storage; a separate frontend integration is needed if you want website profile management to edit the same Supabase records.
- The existing RCL Maker generator endpoints remain as they were. This package resolves the Cover Letter signature server-side before calling them.
- Test against your real Supabase project and Vercel deployment. Syntax checks do not prove remote database, Storage, or PDF/DOCX generation connectivity.

## Local syntax checks

From the repository root:

```bash
node --check server.js
```

For the standalone MCP package:

```bash
cd mcp-server
npm install
npm run check
```
