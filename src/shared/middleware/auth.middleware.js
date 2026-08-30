const { supabase } = require('../../config/supabase');
const { query } = require('../../config/database');
const logger = require('../utils/logger');

/**
 * Verify a Supabase access token and attach the local profile to the request.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required. Please sign in.' }
      });
    }

    const token = authHeader.split('Bearer ')[1];

    const { data: { user: authUser }, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token.' }
      });
    }

    // Get or create user in database
    let userResult = await query(
      'SELECT * FROM users WHERE supabase_uid = $1',
      [authUser.id]
    );

    let user = userResult.rows[0];

    if (!user) {
      // Auto-create user if not in DB yet
      const newUser = await query(
        `INSERT INTO users (supabase_uid, email, name, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          authUser.id,
          authUser.email,
          authUser.user_metadata?.name || authUser.email.split('@')[0],
          authUser.user_metadata?.avatar_url || null,
          Boolean(authUser.email_confirmed_at),
        ]
      );
      user = newUser.rows[0];
      logger.info('Auto-created user:', user.id);
    }

    // Check if user is suspended
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended. Contact support.' }
      });
    }

    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err);

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token.' }
    });
  }
};

/**
 * Check if user has required role
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' }
      });
    }

    if (!roles.includes(req.user.type)) {
      return res.status(403).json({
        success: false,
        error: { 
          code: 'FORBIDDEN', 
          message: `Access denied. Required role: ${roles.join(' or ')}.` 
        }
      });
    }

    next();
  };
};

/**
 * Check if user is admin
 */
const requireAdmin = requireRole('admin');

/**
 * Optional authentication - attaches user if token present, doesn't fail if missing
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split('Bearer ')[1];
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser) return next();

    const userResult = await query(
      'SELECT * FROM users WHERE supabase_uid = $1',
      [authUser.id]
    );

    if (userResult.rows[0]) {
      req.user = userResult.rows[0];
    }

    next();
  } catch {
    next(); // Continue without user
  }
};

module.exports = { authenticate, requireRole, requireAdmin, optionalAuth };
