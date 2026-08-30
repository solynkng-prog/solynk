const { query } = require('../../config/database');
const logger = require('../../shared/utils/logger');

class QuotesController {
  /**
   * GET /quotes
   * List user's quote requests
   */
  static async list(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = (page - 1) * limit;
      const status = req.query.status;

      let whereClause = 'WHERE q.user_id = $1';
      const params = [userId];
      let paramCount = 2;

      if (status) {
        whereClause += ` AND q.status = $${paramCount++}`;
        params.push(status);
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT q.*, 
                i.company_name as installer_name, i.city, i.state,
                p.name as project_name
         FROM quote_requests q
         JOIN installers i ON i.id = q.installer_id
         LEFT JOIN projects p ON p.id = q.project_id
         ${whereClause}
         ORDER BY q.created_at DESC
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM quote_requests q ${whereClause}`,
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
   * GET /quotes/:id
   */
  static async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        `SELECT q.*, 
                i.company_name as installer_name, i.city, i.state, i.phone, i.email,
                p.name as project_name, p.total_cost as project_cost
         FROM quote_requests q
         JOIN installers i ON i.id = q.installer_id
         LEFT JOIN projects p ON p.id = q.project_id
         WHERE q.id = $1 AND q.user_id = $2`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote not found' }
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
   * PATCH /quotes/:id/respond
   * Installer responds with quote
   */
  static async respond(req, res, next) {
    try {
      const { id } = req.params;
      const { responseMessage, quoteAmount, validUntil } = req.body;

      // Verify installer ownership (would check installer user_id)
      const result = await query(
        `UPDATE quote_requests 
         SET status = 'quoted', response_message = $1, quote_amount = $2, 
             quote_valid_until = $3, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [responseMessage, quoteAmount, validUntil, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote request not found' }
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
   * PATCH /quotes/:id/accept
   */
  static async accept(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        `UPDATE quote_requests 
         SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote not found' }
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
   * PATCH /quotes/:id/decline
   */
  static async decline(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { reason } = req.body;

      const result = await query(
        `UPDATE quote_requests 
         SET status = 'declined', response_message = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [reason, id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote not found' }
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
   * DELETE /quotes/:id
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        'DELETE FROM quote_requests WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote not found' }
        });
      }

      res.json({
        success: true,
        message: 'Quote cancelled',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = QuotesController;
