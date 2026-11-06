module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed');
  }

  try {
    const { verifyDownloadToken } = await import('../../mcp-server/src/temp-storage.js');
    const token = String(req.query?.token || '');
    const item = verifyDownloadToken(token);
    if (!item) return res.status(410).json({ error: 'This download link is invalid or has expired.' });

    const upstream = await fetch(item.url, { method: req.method });
    if (!upstream.ok) return res.status(upstream.status === 404 ? 410 : 502).json({ error: 'Temporary document is no longer available.' });

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${String(item.fileName).replace(/["\\\r\n]/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.status(200).end();
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Length', String(bytes.length));
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('RCL Maker temporary download failed:', error);
    return res.status(500).json({ error: 'Unable to retrieve temporary document.' });
  }
};
