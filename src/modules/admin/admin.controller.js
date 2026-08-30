const { query } = require('../../config/database');
const logger = require('../../shared/utils/logger');

class AdminController {
  /**
   * GET /admin/dashboard
   * Platform analytics summary
   */
  static async getDashboard(req, res, next) {
    try {
      // Aggregate metrics
      const metricsQueries = await Promise.all([
        query('SELECT COUNT(*) FROM users WHERE status = $1', ['active']),
        query("SELECT COUNT(*) FROM users WHERE created_at > CURRENT_DATE - INTERVAL '1 day'"),
        query('SELECT COUNT(*) FROM installers WHERE status = $1', ['verified']),
        query("SELECT COUNT(*) FROM installers WHERE status = $1 AND created_at > CURRENT_DATE - INTERVAL '1 day'", ['verified']),
        query('SELECT COUNT(*) FROM calculation_logs'),
        query("SELECT COUNT(*) FROM calculation_logs WHERE created_at > CURRENT_DATE - INTERVAL '1 day'"),
        query("SELECT COALESCE(SUM(price), 0) FROM subscriptions WHERE status = 'active' AND plan != 'free'"),
        query("SELECT COUNT(*) FROM quote_requests WHERE created_at > CURRENT_DATE - INTERVAL '7 days'"),
      ]);

      const metrics = {
        totalUsers: parseInt(metricsQueries[0].rows[0].count),
        newUsersToday: parseInt(metricsQueries[1].rows[0].count),
        totalInstallers: parseInt(metricsQueries[2].rows[0].count),
        newInstallersToday: parseInt(metricsQueries[3].rows[0].count),
        totalCalculations: parseInt(metricsQueries[4].rows[0].count),
        calculationsToday: parseInt(metricsQueries[5].rows[0].count),
        monthlyRevenue: parseInt(metricsQueries[6].rows[0].sum),
        weeklyQuotes: parseInt(metricsQueries[7].rows[0].count),
      };

      // User growth (last 6 months)
      const userGrowth = await query(
        `SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
         FROM users
         WHERE created_at > CURRENT_DATE - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY month`
      );

      // Revenue breakdown by plan
      const revenueBreakdown = await query(
        `SELECT plan, COUNT(*) as subscribers, SUM(price) as revenue
         FROM subscriptions
         WHERE status = 'active' AND plan != 'free'
         GROUP BY plan`
      );

      // Plan distribution
      const planDistribution = await query(
        `SELECT plan, COUNT(*) as count
         FROM users
         WHERE status = 'active'
         GROUP BY plan`
      );

      // Recent activity
      const recentActivity = await query(
        `SELECT al.*, u.name as user_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.created_at DESC
         LIMIT 20`
      );

      res.json({
        success: true,
        data: {
          metrics,
          charts: {
            userGrowth: userGrowth.rows,
            revenueBreakdown: revenueBreakdown.rows,
            planDistribution: planDistribution.rows,
          },
          recentActivity: recentActivity.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/users
   * List all users
   */
  static async listUsers(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = (page - 1) * limit;
      const plan = req.query.plan;
      const status = req.query.status;
      const search = req.query.search;

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (plan) {
        whereClause += ` AND plan = $${paramCount++}`;
        params.push(plan);
      }
      if (status) {
        whereClause += ` AND status = $${paramCount++}`;
        params.push(status);
      }
      if (search) {
        whereClause += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT id, name, email, type, plan, status, created_at, last_login,
                (SELECT COUNT(*) FROM projects WHERE user_id = users.id) as project_count
         FROM users
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM users ${whereClause}`,
        params.slice(0, paramCount - 3)
      );

      res.json({
        success: true,
        data: result.rows,
        meta: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/users/:id
   */
  static async getUser(req, res, next) {
    try {
      const { id } = req.params;

      const result = await query(
        `SELECT u.*, 
                (SELECT json_agg(p.*) FROM projects p WHERE p.user_id = u.id LIMIT 10) as projects,
                (SELECT json_agg(s.*) FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 5) as subscriptions
         FROM users u
         WHERE u.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' }
        });
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
   * PATCH /admin/users/:id/plan
   */
  static async updateUserPlan(req, res, next) {
    try {
      const { id } = req.params;
      const { plan } = req.body;

      await query('UPDATE users SET plan = $1 WHERE id = $2', [plan, id]);

      logger.info('Admin changed user plan', { adminId: req.user.id, userId: id, plan });

      res.json({
        success: true,
        message: `User plan updated to ${plan}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/users/:id/status
   */
  static async updateUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);

      logger.info('Admin changed user status', { adminId: req.user.id, userId: id, status });

      res.json({
        success: true,
        message: `User status updated to ${status}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /admin/users/:id
   */
  static async deleteUser(req, res, next) {
    try {
      const { id } = req.params;

      const userResult = await query('SELECT supabase_uid FROM users WHERE id = $1', [id]);
      if (userResult.rows.length > 0) {
        const { supabase } = require('../../config/supabase');
        const { error } = await supabase.auth.admin.deleteUser(userResult.rows[0].supabase_uid);
        if (error) throw error;
      }

      await query('DELETE FROM users WHERE id = $1', [id]);

      logger.info('Admin deleted user', { adminId: req.user.id, userId: id });

      res.json({
        success: true,
        message: 'User deleted',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/installers
   */
  static async listInstallers(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = (page - 1) * limit;
      const status = req.query.status;

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (status) {
        whereClause += ` AND status = $${paramCount++}`;
        params.push(status);
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT * FROM installers ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM installers ${whereClause}`,
        params.slice(0, paramCount - 3)
      );

      res.json({
        success: true,
        data: result.rows,
        meta: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/installers/:id/verify
   */
  static async verifyInstaller(req, res, next) {
    try {
      const { id } = req.params;

      await query(
        "UPDATE installers SET is_verified = TRUE, status = 'verified', verification_date = CURRENT_TIMESTAMP WHERE id = $1",
        [id]
      );

      logger.info('Admin verified installer', { adminId: req.user.id, installerId: id });

      res.json({
        success: true,
        message: 'Installer verified',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/installers/:id/status
   */
  static async updateInstallerStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await query('UPDATE installers SET status = $1 WHERE id = $2', [status, id]);

      res.json({
        success: true,
        message: `Installer status updated to ${status}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /admin/installers/:id
   */
  static async deleteInstaller(req, res, next) {
    try {
      const { id } = req.params;
      await query('DELETE FROM installers WHERE id = $1', [id]);

      res.json({
        success: true,
        message: 'Installer removed',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/reports
   */
  static async listReports(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = (page - 1) * limit;

      const result = await query(
        `SELECT r.*, u.name as user_name, p.name as project_name
         FROM reports r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN projects p ON p.id = r.project_id
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await query('SELECT COUNT(*) FROM reports');

      res.json({
        success: true,
        data: result.rows,
        meta: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/calculations
   */
  static async getCalculations(req, res, next) {
    try {
      const stats = await query(
        `SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as count,
          AVG(execution_time_ms) as avg_time,
          AVG(total_demand_wh) as avg_demand
         FROM calculation_logs
         WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY date`
      );

      res.json({
        success: true,
        data: stats.rows,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/revenue
   */
  static async getRevenue(req, res, next) {
    try {
      const monthly = await query(
        `SELECT 
          DATE_TRUNC('month', created_at) as month,
          plan,
          COUNT(*) as new_subscriptions,
          SUM(price) as revenue
         FROM subscriptions
         WHERE status = 'active' AND plan != 'free'
         GROUP BY DATE_TRUNC('month', created_at), plan
         ORDER BY month DESC
         LIMIT 12`
      );

      res.json({
        success: true,
        data: monthly.rows,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/activity
   */
  static async getActivity(req, res, next) {
    try {
      const result = await query(
        `SELECT al.*, u.name as user_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.created_at DESC
         LIMIT 100`
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AdminController;
