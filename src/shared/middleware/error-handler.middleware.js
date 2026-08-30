const logger = require('../utils/logger');

/**
 * Global error handler middleware
 * Must be last middleware in the stack
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    requestId: req.requestId,
  });

  // Handle specific error types
  if (err.code === '23505') {
    // PostgreSQL unique violation
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this information already exists.',
      },
    });
  }

  if (err.code === '23503') {
    // PostgreSQL foreign key violation
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Referenced record does not exist.',
      },
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      },
    });
  }

  // Default: internal server error
  const isDev = process.env.NODE_ENV === 'development';

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred. Please try again.',
      ...(isDev && { stack: err.stack }),
      requestId: req.requestId,
    },
  });
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found.`,
    },
  });
};

module.exports = { errorHandler, notFoundHandler };
