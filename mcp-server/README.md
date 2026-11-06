# RCL Maker MCP Server

Remote MCP server that exposes the existing RCL Maker generators to MCP-compatible AI clients.

## What it does

- Lists the three existing document types: Resume, CV, and Cover Letter.
- Explains the exact fields accepted by the current RCL Maker API.
- Generates PDF and DOCX by calling the existing RCL Maker endpoints.
- Returns the generated PDF or DOCX file directly in the MCP tool response.
- Does not store generated documents in Cloudflare R2, S3, or another external storage service.
- Uses API-key identity to authenticate MCP users; no document storage namespace is needed.

## Important repository-specific details

The MCP adapter follows the current `server.js` routes and browser payloads:

| Document | PDF endpoint | DOCX endpoint |
|---|---|---|
| Resume | `/api/generate-resume-pdf` | `/api/generate-docx` |
| CV | `/api/generate-cv-pdf` | `/api/generate-cv-docx` |
| Cover Letter | `/api/generate-letter-pdf` | `/api/generate-letter-docx` |

The profile is currently stored in browser `localStorage` under `resumeFillerProfile`. MCP cannot read a visitor's browser storage. The AI client must collect profile data in its conversation or the user must explicitly provide/export it. This MCP does not silently access the website visitor's browser profile.

The current CV PDF endpoint accepts `projects`, but the existing CV DOCX generator intentionally has its project section commented out. The MCP passes projects to the existing API, but does not change that template behavior.

## Requirements

- Node.js 22.17+ (same runtime as the main project)
- The existing RCL Maker Vercel project/repository
- One or more API keys for MCP clients

## Deploy to the existing Vercel project (recommended)

The MCP endpoint is implemented as a Vercel Serverless Function in `api/mcp.js`. It is part of the same repository and same Vercel project as the website. Do not create a second Vercel project and do not deploy `mcp-server/` as a separate service.

The root `vercel.json` installs the MCP package dependencies using `npm --prefix mcp-server install`. The existing website routes and `api/[...path].js` remain in place. The exact route `/api/mcp` is handled by `api/mcp.js`.

In the existing Vercel project, open **Settings → Environment Variables** and add:

```dotenv
MCP_API_KEYS=replace-with-long-random-token:owner
RCL_API_BASE_URL=https://your-existing-rcl-maker-domain.vercel.app
RCL_API_TIMEOUT_MS=90000
```

Set `RCL_API_BASE_URL` to the production URL of this same RCL Maker deployment (without a trailing slash). The MCP function calls the existing `/api/generate-*` routes through that URL. Never put `MCP_API_KEYS` in frontend JavaScript or expose it to browser visitors.

Generate a strong token locally:

```bash
openssl rand -hex 32
```

For multiple controlled users, use comma-separated entries:

```dotenv
MCP_API_KEYS=token-for-owner:owner,token-for-user-2:user-2
```

After setting the variables, redeploy the existing Vercel project. The MCP endpoint will be:

```text
https://your-existing-rcl-maker-domain.vercel.app/api/mcp
```

No Cloudflare R2, S3, database, or document-storage configuration is needed.

Generate a strong token:

```bash
openssl rand -hex 32
```

The API-key format is `token:user-id`. For multiple users, use comma-separated entries:

```dotenv
MCP_API_KEYS=token-for-alief:alief,token-for-user-2:user-2
```

The user ID identifies the authenticated MCP user for access control. Do not reuse one user ID for unrelated customers.

## Run locally

For local development, install both the main project and MCP dependencies:

```bash
npm install
npm --prefix mcp-server install
```

Set `MCP_API_KEYS` and `RCL_API_BASE_URL` in the environment, then run the standalone development server:

```bash
cd mcp-server
npm run check
npm start
```

The standalone local endpoint is `http://localhost:8787/mcp`. The deployed Vercel endpoint is `/api/mcp`.

Use the MCP endpoint with an MCP client that supports Streamable HTTP and configure the bearer token:

```http
Authorization: Bearer YOUR_TOKEN
```

This implementation uses stateless Streamable HTTP with JSON responses. It accepts MCP requests over POST; GET/SSE sessions are intentionally not enabled.

## Tools

### `list_templates`

Returns Resume, CV, and Cover Letter formats, supported languages, and file types.

### `get_document_schema`

Returns the field names accepted by the existing RCL Maker endpoints.

### `generate_pdf`

Input:
- `documentType`: `resume`, `cv`, or `cover_letter`
- `data`: request body using the current RCL Maker field names

### `generate_docx`

Same input as `generate_pdf`, but uses the existing DOCX endpoints. The generated DOCX is also returned directly in the tool response.

Both generation tools return the document as an embedded file resource in the MCP response, alongside basic metadata such as the filename. The MCP server does not retain a copy after returning the response. The AI client must support MCP embedded resources with binary `blob` content and present the file attachment to the user. No download URL or later retrieval tool is provided.

## Data payload examples

### Resume

```json
{
  "profile": {
    "name": "Alex Example",
    "phone": "+62 812 0000 0000",
    "email": "alex@example.com",
    "location": "Jakarta, Indonesia",
    "letterYear": "2026",
    "experiences": [
      {
        "role": "Backend Developer",
        "company": "Example Company",
        "location": "Jakarta",
        "start": "2024-01",
        "end": "2025-01",
        "description": "Built REST APIs\nImproved database queries"
      }
    ],
    "educationDegreeId": "S1 Teknik Informatika",
    "educationDegreeEn": "Bachelor of Informatics",
    "educationInstitution": "Example University",
    "educationLocation": "Jakarta",
    "educationStart": "2021-08",
    "educationEnd": "2025-08",
    "educationGpa": "3.55"
  },
  "posisi": "Backend Developer",
  "lang": "en",
  "tag1": "Backend Developer",
  "tag2": "Node.js",
  "ringkasan": "Informatics graduate with experience building REST APIs.",
  "job1": "Developed REST APIs\nMaintained backend services",
  "job2": "",
  "job3": "",
  "org1": "",
  "skills": [
    { "label": "Programming", "desc": "JavaScript, Node.js, SQL" }
  ]
}
```

### CV

Use the same `profile` shape, plus:

```json
{
  "posisi": "Software Engineer",
  "lang": "id",
  "ringkasan": "Ringkasan profesional.",
  "job1": "Pencapaian pekerjaan pertama",
  "job2": "",
  "job3": "",
  "org1": "",
  "projects": [
    { "name": "Project A", "year": "2025", "desc": "REST API service" }
  ],
  "skills": [
    { "label": "Programming", "desc": "JavaScript, Node.js" }
  ]
}
```

### Cover Letter

Use the same `profile` shape, plus:

```json
{
  "posisi": "Backend Developer",
  "perusahaan": "Example Company",
  "program": "",
  "institusi": "",
  "tanggal": "6 November",
  "letterCity": "Jakarta",
  "companyCity": "Jakarta",
  "companyCountry": "Indonesia",
  "surat": "Dengan hormat,\n\nSaya bermaksud melamar posisi Backend Developer...",
  "language": "id"
}
```

## Document handling and privacy

Generated PDF/DOCX bytes are held in memory while the request is processed and encoded as a base64 MCP embedded resource in the tool response. The MCP service does not write generated documents to local disk or external object storage. After the response has been sent and request memory is released, the MCP service does not provide a way to retrieve the document again. The MCP client may independently retain conversation attachments according to its own behavior and policies; this server cannot control that.

## Vercel runtime notes

The deployed route is stateless Streamable HTTP with JSON responses and accepts POST requests. Each invocation creates and closes an MCP server/transport, which is suitable for Vercel Functions. The current `vercel.json` sets a 60-second function duration; actual maximum duration is also subject to the Vercel plan. The upstream generator call has a 90-second client timeout by default, so set a sensible timeout below the function's effective maximum if needed.

The website and MCP share one Vercel project, but the MCP endpoint is protected by its own bearer API key. Existing website generator routes remain accessible according to their existing behavior.

## Authentication and public access

This starter uses per-user static bearer API keys. It supports a personal key and multiple public-user keys, each mapped to a distinct user ID. Do not publish a shared key in frontend JavaScript.

For a public multi-tenant commercial service, add an OAuth 2.1 authorization server, account provisioning, revocation, quotas/billing, abuse monitoring, and privacy/retention controls before opening registration. The API-key approach is suitable for controlled beta access and private integrations, not anonymous public access. Since generated files are returned directly, each client must support MCP embedded resources and enforce reasonable response-size limits.

## Security notes

- Keep `.env` out of Git.
- Use unique high-entropy API keys per user.
- Never send the API key to the browser.
- The current upstream RCL Maker generator endpoints are already public routes in the original app. The MCP key protects MCP access, but does not make those pre-existing website endpoints private.
- The MCP bearer key protects `/api/mcp`; it does not make the pre-existing public `/api/generate-*` endpoints private.
- Vercel serverless instances are ephemeral. Do not rely on in-memory rate limits for strong abuse prevention; configure Vercel Firewall/rate limiting or a shared rate-limit service before opening broad public access.
- Static API keys are suitable for personal use or a controlled beta. Public self-service access needs user onboarding, key revocation, quotas, abuse monitoring, and preferably OAuth 2.1.
