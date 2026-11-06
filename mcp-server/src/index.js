import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authenticate } from './auth.js';
import { createMcpServer } from './mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rcl-maker-mcp' });
});

app.use('/mcp', authenticate);
app.use('/mcp', rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId || req.ip,
}));

app.post('/mcp', async (req, res) => {
  const mcpServer = createMcpServer({ userId: req.auth.userId });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP server error.' },
        id: req.body?.id ?? null,
      });
    }
  } finally {
    await transport.close().catch(() => {});
    await mcpServer.close().catch(() => {});
  }
});

app.get('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'This stateless MCP endpoint accepts POST requests only.' });
});

app.delete('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'This stateless MCP endpoint does not use sessions.' });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled HTTP error:', error);
  res.status(400).json({ error: 'Invalid request.' });
});

app.listen(config.port, () => {
  console.log(`RCL Maker MCP listening on port ${config.port}`);
});
