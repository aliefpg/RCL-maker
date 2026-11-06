import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticate(req, res, next) {
  const authorization = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Provide an API key using the Authorization: Bearer <token> header.',
    });
  }

  const entry = config.apiKeys.find((candidate) => safeEqual(candidate.token, match[1]));
  if (!entry) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key.' });
  }

  req.auth = { userId: entry.userId };
  next();
}
