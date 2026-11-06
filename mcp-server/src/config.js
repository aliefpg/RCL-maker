function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseApiKeys(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.lastIndexOf(':');
      if (separator <= 0 || separator === entry.length - 1) {
        throw new Error('MCP_API_KEYS must use token:user-id entries separated by commas.');
      }
      return { token: entry.slice(0, separator), userId: entry.slice(separator + 1) };
    });
}

export const config = {
  port: Number(process.env.PORT || 8787),
  publicUrl: process.env.MCP_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`,
  apiKeys: parseApiKeys(required('MCP_API_KEYS')),
  rclApiBaseUrl: required('RCL_API_BASE_URL').replace(/\/+$/, ''),
  rclApiTimeoutMs: Number(process.env.RCL_API_TIMEOUT_MS || 90000),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
};
