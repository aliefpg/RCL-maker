
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';

  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { cleanupExpiredDocuments } = await import(
      '../../mcp-server/src/temp-storage.js'
    );

    const result = await cleanupExpiredDocuments();

    return res.status(200).json(result);
  } catch (error) {
    console.error('Supabase temporary-file cleanup failed:', error);

    return res.status(500).json({
      success: false,
      error: 'Temporary document cleanup failed.',
    });
  }
};
