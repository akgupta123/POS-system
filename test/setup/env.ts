const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://pos:pos@localhost:5432/pos_test';

process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
