# RCL Maker MCP on Vercel

The MCP endpoint is integrated into the existing RCL Maker repository and the same Vercel project. No second project, VPS, Cloudflare R2, S3, or document storage is required.

## Deployment

1. Commit and push this repository update to the Git branch connected to the existing Vercel project.
2. In Vercel → Project Settings → Environment Variables, add `MCP_API_KEYS`, `RCL_API_BASE_URL`, and optionally `RCL_API_TIMEOUT_MS`.
3. Set `RCL_API_BASE_URL` to the production URL of the same RCL Maker deployment.
4. Redeploy the existing Vercel project.
5. Connect an MCP client to `https://your-domain/api/mcp` with `Authorization: Bearer YOUR_TOKEN`.

`vercel.json` installs the nested MCP package dependencies. `api/mcp.js` is the stateless Vercel Function endpoint. The existing website and Express generator API remain served by `api/[...path].js`.

## Tools

- `list_templates`
- `get_document_schema`
- `generate_pdf`
- `generate_docx`

Generated document bytes are returned directly as MCP embedded resources. No temporary or permanent file storage is used. The AI client must support MCP binary resources to expose the PDF/DOCX as a downloadable attachment.

## Notes

- The website's profile in browser `localStorage` is not automatically accessible to MCP; the user must provide the data in the AI conversation.
- Existing generator routes remain publicly accessible as they were before. The MCP bearer key only protects `/api/mcp`.
- The deployed function is stateless and uses a per-invocation MCP transport. Vercel plan limits apply to function duration and payload size.
- Static API keys are for personal use or controlled beta, not anonymous public registration.
