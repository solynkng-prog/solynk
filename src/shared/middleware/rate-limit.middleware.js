const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../../config/redis');

const createStore = (prefix) => process.env.NODE_ENV === 'test' ||
  process.env.REDIS_ENABLED !== 'true'
  ? undefined
  : new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });

// General API rate limiter
const apiLimiter = rateLimit({
  store: createStore('rl:api:'),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  // These endpoints are required to bootstrap the browser and should not be
  // blocked by refreshes or static asset requests.
  skip: (req) => req.path === '/health' ||
    req.path === '/api/config' ||
    req.path === '/' ||
    /\.(?:html|css|js|png|jpe?g|svg|ico|webp|mp4|webm|woff2?)$/i.test(req.path),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
      },
    });
  },
});

// Stricter limiter for calculation endpoints
const calculationLimiter = rateLimit({
  store: createStore('rl:calc:'),
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'CALC_RATE_LIMITED',
        message: 'Calculation limit reached. Upgrade for unlimited calculations.',
        upgradeUrl: '/billing/upgrade',
      },
    });
  },
});

// Auth endpoints limiter (prevent brute force)
const authLimiter = rateLimit({
  store: createStore('rl:auth:'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
      },
    });
  },
});

module.exports = { apiLimiter, calculationLimiter, authLimiter };
