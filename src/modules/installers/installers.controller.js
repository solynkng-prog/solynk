const { query, transaction } = require('../../config/database');
const logger = require('../../shared/utils/logger');

class InstallersController {
  /**
   * GET /installers
   * List installers (public, filterable)
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = (page - 1) * limit;
      const state = req.query.state;
      const ratingMin = parseFloat(req.query.rating_min) || 0;
      const service = req.query.service;
      const verifiedOnly = req.query.verified_only === 'true';
      const sort = req.query.sort || 'rating';
      const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseFloat(req.query.radius) || 50;

      let whereClause = 'WHERE status = $1';
      const params = ['verified'];
      let paramCount = 2;

      if (state) {
        whereClause += ` AND state = $${paramCount++}`;
        params.push(state);
      }

      if (ratingMin > 0) {
        whereClause += ` AND rating >= $${paramCount++}`;
        params.push(ratingMin);
      }

      if (service) {
        whereClause += ` AND services @> $${paramCount++}::jsonb`;
        params.push(JSON.stringify([service]));
      }

      if (verifiedOnly) {
        whereClause += ` AND is_verified = TRUE`;
      }

      // Geospatial filter (simplified - would use PostGIS in production)
      if (lat && lng) {
        // This is a placeholder for actual geospatial query
        // In production: use ST_DWithin with PostGIS
        whereClause += ` AND city IS NOT NULL`;
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT id, company_name, contact_name, city, state, rating, review_count,
                is_verified, is_premium, is_featured, years_experience, projects_completed,
                services, certifications, logo_url, description
         FROM installers
         ${whereClause}
         ORDER BY ${sort === 'rating' ? 'rating' : 'created_at'} ${order}
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
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
   * GET /installers/:id
   * Get installer profile
   */
  static async getOne(req, res, next) {
    try {
      const { id } = req.params;

      const installerResult = await query(
        `SELECT i.*, 
                (SELECT json_agg(json_build_object(
                  'id', r.id, 'userName', u.name, 'rating', r.rating,
                  'title', r.title, 'body', r.body, 'createdAt', r.created_at,
                  'isVerified', r.is_verified
                ))
                 FROM installer_reviews r
                 JOIN users u ON u.id = r.user_id
                 WHERE r.installer_id = i.id
                 ORDER BY r.created_at DESC
                 LIMIT 10
                ) as recent_reviews
         FROM installers i
         WHERE i.id = $1 AND i.status = $2`,
        [id, 'verified']
      );

      if (installerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Installer not found' }
        });
      }

      res.json({
        success: true,
        data: installerResult.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /installers/:id/reviews
   */
  static async getReviews(req, res, next) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = (page - 1) * limit;

      const result = await query(
        `SELECT r.id, r.rating, r.title, r.body, r.is_verified, r.created_at,
                u.name as user_name, u.avatar_url as user_avatar
         FROM installer_reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.installer_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limit, offset]
      );

      const countResult = await query(
        'SELECT COUNT(*) FROM installer_reviews WHERE installer_id = $1',
        [id]
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
   * POST /installers/:id/reviews
   */
  static async createReview(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { rating, title, body, projectId } = req.body;

      // Verify user has a completed project with this installer
      const projectCheck = await query(
        `SELECT q.id FROM quote_requests q
         WHERE q.installer_id = $1 AND q.user_id = $2 AND q.status = 'accepted'`,
        [id, userId]
      );

      const isVerified = projectCheck.rows.length > 0;

      const result = await query(
        `INSERT INTO installer_reviews (installer_id, user_id, project_id, rating, title, body, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, userId, projectId || null, rating, title, body, isVerified]
      );

      // Update installer rating
      await query(
        `UPDATE installers 
         SET rating = (SELECT AVG(rating) FROM installer_reviews WHERE installer_id = $1),
             review_count = (SELECT COUNT(*) FROM installer_reviews WHERE installer_id = $1)
         WHERE id = $1`,
        [id]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /installers/:id/quotes
   */
  static async requestQuote(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { message, preferredDate, budgetRange, projectId } = req.body;

      const result = await query(
        `INSERT INTO quote_requests (user_id, installer_id, project_id, message, preferred_date, budget_range, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, id, projectId || null, message, preferredDate || null, budgetRange || null, 'pending']
      );

      // Notify installer (would trigger email/push notification)
      logger.info('Quote requested', { userId, installerId: id, quoteId: result.rows[0].id });

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /installers/nearby
   */
  static async nearby(req, res, next) {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseFloat(req.query.radius) || 50;
      const service = req.query.service;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'lat and lng parameters required' }
        });
      }

      // Simplified nearby query (would use PostGIS ST_DWithin in production)
      let whereClause = 'WHERE status = $1';
      const params = ['verified'];
      let paramCount = 2;

      if (service) {
        whereClause += ` AND services @> $${paramCount++}::jsonb`;
        params.push(JSON.stringify([service]));
      }

      const result = await query(
        `SELECT id, company_name, city, state, rating, review_count,
                is_verified, services, years_experience
         FROM installers
         ${whereClause}
         ORDER BY rating DESC
         LIMIT 50`,
        params
      );

      res.json({
        success: true,
        data: result.rows,
        meta: {
          searchLocation: { lat, lng },
          radiusMiles: radius,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = InstallersController;
