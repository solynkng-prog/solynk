const Redis = require('ioredis');
require('dotenv').config();

const redisEnabled = process.env.REDIS_ENABLED === 'true';
const redis = redisEnabled
  ? new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    })
  : {
      get: async () => null,
      call: async () => {
        throw new Error('Redis is disabled. Set REDIS_ENABLED=true to enable it.');
      },
    };

if (redisEnabled) {
  redis.on('connect', () => {
    console.log('Redis connected');
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });
}

module.exports = redis;
