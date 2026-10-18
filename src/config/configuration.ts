export const loadConfig = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  redis: {
    url: process.env.REDIS_URL,
    catalogTtlSeconds: parseInt(process.env.CATALOG_CACHE_TTL_SECONDS ?? '60', 10),
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER ?? 'mock',
  },
});

export function validateEnv(env: Record<string, unknown>) {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return env;
}
