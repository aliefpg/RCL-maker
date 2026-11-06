// Vercel Serverless Function entry point for the stateless RCL Maker MCP endpoint.
// The main website and existing Express API remain served by api/[...path].js.

let modulesPromise;
function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import('../mcp-server/src/config.js'),
      import('../mcp-server/src/mcp.js'),
      import('../mcp-server/src/transport.js'),
    ]).then(([configModule, mcpModule, transportModule]) => ({
      config: configModule.config,
      createMcpServer: mcpModule.createMcpServer,
      createTransport: transportModule.createTransport,
    }));
  }
  return modulesPromise;
}

function authenticate(req, apiKeys) {
  const authorization = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;

  const supplied = Buffer.from(match[1]);
  for (const entry of apiKeys) {
    const expected = Buffer.from(entry.token);
    if (supplied.length === expected.length && require('node:crypto').timingSafeEqual(supplied, expected)) {
      return entry.userId;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST for this stateless MCP endpoint.' });
  }

  let transport;
  let mcpServer;
  try {
    const { config, createMcpServer, createTransport } = await loadModules();
    const userId = authenticate(req, config.apiKeys);
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provide a valid API key using Authorization: Bearer <token>.',
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected an application/json MCP request body.' });
    }

    mcpServer = createMcpServer({ userId });
    transport = createTransport();

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('RCL Maker MCP request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP server error. Check the Vercel function logs.' },
        id: req.body?.id ?? null,
      });
    }
  } finally {
    if (transport) await transport.close().catch(() => {});
    if (mcpServer) await mcpServer.close().catch(() => {});
  }
}
