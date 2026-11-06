module.exports = async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { list, del } = await import('@vercel/blob');
    const cutoff = Date.now() - 5 * 60 * 1000;
    let cursor;
    let deleted = 0;
    do {
      const page = await list({ prefix: 'rcl-temp/', cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
      const expired = page.blobs.filter((blob) => new Date(blob.uploadedAt).getTime() <= cutoff);
      if (expired.length) {
        await del(expired.map((blob) => blob.url), { token: process.env.BLOB_READ_WRITE_TOKEN });
        deleted += expired.length;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return res.status(200).json({ success: true, deleted });
  } catch (error) {
    console.error('RCL Maker temporary file cleanup failed:', error);
    return res.status(500).json({ error: 'Temporary file cleanup failed.' });
  }
};
