const { supabase, supabaseAuth } = require('../../config/supabase');
const { query } = require('../../config/database');
const logger = require('../../shared/utils/logger');
const EmailService = require('../../shared/utils/email');

const normalizeAccountType = (type) => type === 'seller' || type === 'installer' ? 'installer' : 'homeowner';

class AuthController {
  /**
   * POST /auth/register
   * Register a Supabase user and local profile
   */
  static async register(req, res, next) {
    try {
      const { email, password, name } = req.body;
      const type = normalizeAccountType(req.body.type);
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email, password, and name are required.' }
        });
      }

      const { data: { user: authUser }, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, type }
        });
      if (authError) throw authError;

      // Create local user record
      const userResult = await query(
        `INSERT INTO users (supabase_uid, email, name, type, plan, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [authUser.id, email, name, type, 'free', 'active']
      );

      const user = userResult.rows[0];

      // Create free subscription
      await query(
        `INSERT INTO subscriptions (user_id, plan, price, billing_cycle, status, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '100 years')`,
        [user.id, 'free', 0, 'monthly', 'active']
      );

      const { data: sessionData, error: sessionError } =
        await supabaseAuth.auth.signInWithPassword({ email, password });
      if (sessionError) throw sessionError;

      // Send welcome email
      await EmailService.sendWelcomeEmail({ to: email, name });

      logger.info('User registered', { userId: user.id, email });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            type: user.type,
            plan: user.plan,
          },
          token: sessionData.session.access_token,
        },
      });
    } catch (err) {
      if (err.code === 'user_already_exists' || err.code === 'email_exists') {
        return res.status(409).json({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }
        });
      }
      next(err);
    }
  }

  /**
   * POST /auth/login
   * Sign in with Supabase and return the local user profile
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' }
        });
      }
      const { data: sessionData, error: signInError } =
        await supabaseAuth.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const decodedToken = sessionData.user;

      // Get or create user
      let userResult = await query(
        'SELECT * FROM users WHERE supabase_uid = $1',
        [decodedToken.id]
      );

      let user = userResult.rows[0];

      if (!user) {
        // Auto-create if missing
        const newUser = await query(
          `INSERT INTO users (supabase_uid, email, name, type, plan, status, email_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            decodedToken.id,
            decodedToken.email,
            decodedToken.user_metadata?.name || decodedToken.email.split('@')[0],
            normalizeAccountType(decodedToken.user_metadata?.type),
            'free',
            'active',
            Boolean(decodedToken.email_confirmed_at),
          ]
        );
        user = newUser.rows[0];

        // Create subscription
        await query(
          `INSERT INTO subscriptions (user_id, plan, price, billing_cycle, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, 'free', 0, 'monthly', 'active']
        );
      }

      // Update last login
      await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      // Get subscription info
      const subResult = await query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
        [user.id, 'active']
      );

      logger.info('User logged in', { userId: user.id });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            type: user.type,
            plan: user.plan,
            avatarUrl: user.avatar_url,
            emailVerified: user.email_verified,
          },
          subscription: subResult.rows[0] || null,
          token: sessionData.session.access_token,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/google
   * Google OAuth sign-in
   */
  static async googleSignIn(req, res, next) {
    try {
      const { accessToken } = req.body;
      const { data: { user: decodedToken }, error } =
        await supabase.auth.getUser(accessToken);
      if (error || !decodedToken) throw error || new Error('Invalid access token');

      let userResult = await query(
        'SELECT * FROM users WHERE supabase_uid = $1',
        [decodedToken.id]
      );

      let user = userResult.rows[0];
      let isNew = false;

      if (!user) {
        isNew = true;
        const newUser = await query(
          `INSERT INTO users (supabase_uid, email, name, avatar_url, type, plan, status, email_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            decodedToken.id,
            decodedToken.email,
            decodedToken.user_metadata?.name || decodedToken.email.split('@')[0],
            decodedToken.user_metadata?.avatar_url || null,
            'homeowner',
            'free',
            'active',
            true,
          ]
        );
        user = newUser.rows[0];

        await query(
          `INSERT INTO subscriptions (user_id, plan, price, billing_cycle, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, 'free', 0, 'monthly', 'active']
        );

        await EmailService.sendWelcomeEmail({ to: user.email, name: user.name });
      }

      await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            type: user.type,
            plan: user.plan,
            avatarUrl: user.avatar_url,
          },
          isNew,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/logout
   */
  static async logout(req, res, next) {
    try {
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/forgot-password
   */
  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL }
      });
      if (error) throw error;

      await EmailService.sendPasswordReset({
        to: email,
        resetUrl: data.properties.action_link
      });

      res.json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (err) {
      // Don't reveal if email exists
      res.json({
        success: true,
        message: 'If an account exists, a reset email has been sent.',
      });
    }
  }

  /**
   * GET /auth/me
   */
  static async getMe(req, res, next) {
    try {
      const userResult = await query(
        `SELECT u.*, s.plan as sub_plan, s.status as sub_status, s.current_period_end
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
         WHERE u.id = $1`,
        [req.user.id]
      );

      const user = userResult.rows[0];

      res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          type: user.type,
          plan: user.plan,
          avatarUrl: user.avatar_url,
          location: user.location,
          emailVerified: user.email_verified,
          subscription: {
            plan: user.sub_plan,
            status: user.sub_status,
            expiresAt: user.current_period_end,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /auth/me
   */
  static async updateMe(req, res, next) {
    try {
      const { name, phone, location, avatarUrl } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(phone);
      }
      if (location !== undefined) {
        updates.push(`location = $${paramCount++}`);
        values.push(location);
      }
      if (avatarUrl !== undefined) {
        updates.push(`avatar_url = $${paramCount++}`);
        values.push(avatarUrl);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No fields to update' }
        });
      }

      values.push(req.user.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );

      if (name) {
        const { error } = await supabase.auth.admin.updateUserById(
          req.user.supabase_uid,
          { user_metadata: { name } }
        );
        if (error) throw error;
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /auth/me
   */
  static async deleteAccount(req, res, next) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(req.user.supabase_uid);
      if (error) throw error;

      // Delete from database (cascades to related tables)
      await query('DELETE FROM users WHERE id = $1', [req.user.id]);

      logger.info('User deleted account', { userId: req.user.id });

      res.json({
        success: true,
        message: 'Account deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
