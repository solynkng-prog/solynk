const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const logger = require('./shared/utils/logger');
const { apiLimiter } = require('./shared/middleware/rate-limit.middleware');
const { errorHandler, notFoundHandler } = require('./shared/middleware/error-handler.middleware');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const calculatorRoutes = require('./modules/calculator/calculator.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const installersRoutes = require('./modules/installers/installers.routes');
const quotesRoutes = require('./modules/quotes/quotes.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const postsRoutes = require('./modules/posts/posts.routes');
const productsRoutes = require('./modules/products/products.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'", "https://*.supabase.co"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(compression());

// ===== BODY PARSING =====
// Stripe webhook needs raw body
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/billing/paystack/webhook', express.raw({ type: 'application/json' }));

// Standard JSON parsing for everything else
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== REQUEST ID & LOGGING =====
app.use((req, res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-Id', req.requestId);

  logger.info(`${req.method} ${req.path}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  next();
});

// ===== RATE LIMITING =====
app.use(apiLimiter);

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV,
  });

});

// Public browser configuration; secret Supabase credentials remain server-only.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// Serve the single-page frontend from the project root.
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ===== API ROUTES =====
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/calculate`, calculatorRoutes);
app.use(`/api/${API_VERSION}/projects`, projectsRoutes);
app.use(`/api/${API_VERSION}/installers`, installersRoutes);
app.use(`/api/${API_VERSION}/quotes`, quotesRoutes);
app.use(`/api/${API_VERSION}/exports`, reportsRoutes);
app.use(`/api/${API_VERSION}/billing`, subscriptionsRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/ai`, aiRoutes);
app.use(`/api/${API_VERSION}/posts`, postsRoutes);
app.use(`/api/${API_VERSION}/products`, productsRoutes);

// ===== API DOCUMENTATION (basic) =====
app.get(`/api/${API_VERSION}`, (req, res) => {
  res.json({
    name: 'SOLYNK API',
    version: API_VERSION,
    description: 'Solar Engineering Platform API',
    documentation: 'https://docs.solynk.com',
    endpoints: {
      auth: `/api/${API_VERSION}/auth`,
      calculator: `/api/${API_VERSION}/calculate`,
      projects: `/api/${API_VERSION}/projects`,
      installers: `/api/${API_VERSION}/installers`,
      quotes: `/api/${API_VERSION}/quotes`,
      exports: `/api/${API_VERSION}/exports`,
      billing: `/api/${API_VERSION}/billing`,
      admin: `/api/${API_VERSION}/admin`,
      ai: `/api/${API_VERSION}/ai`,
      products: `/api/${API_VERSION}/products`,
    },
  });
});

// ===== ERROR HANDLING =====
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  // ===== START SERVER =====
  const server = app.listen(PORT, () => {
    logger.info(`🚀 SOLYNK API running on port ${PORT}`);
    logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔌 API Base: /api/${API_VERSION}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

module.exports = app;
