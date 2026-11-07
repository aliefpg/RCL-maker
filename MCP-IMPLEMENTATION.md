# RCL Maker MCP + Master Profile

The current implementation is documented in `README-MASTER-PROFILE.md`.

That guide covers:
- Supabase SQL setup for persistent candidate Master Profiles.
- Per-candidate private signature storage.
- Claude Skill command catalog (`/rcl-maker-assistant`, `/help`, `/status`, and profile/signature/document/job-matching commands).
- The one-time mobile/desktop signature upload page.
- Vercel environment variables and deployment.
- End-to-end tests.

Important: the current project uses Supabase Storage for temporary generated documents through `mcp-server/src/temp-storage.js`. Do not follow older deployment notes that describe Vercel Blob for this implementation.
