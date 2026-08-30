const { query } = require('../../config/database');

const allowedCategories = ['panels', 'inverters', 'batteries', 'accessories', 'kits'];

class ProductsController {
  static async list(req, res, next) {
    try {
      const { category, search, seller_id: sellerId } = req.query;
      const params = [];
      const conditions = ['p.is_published = TRUE', "s.status = 'active'"];

      if (category && allowedCategories.includes(category)) {
        params.push(category);
        conditions.push(`p.category = $${params.length}`);
      }
      if (sellerId) {
        params.push(sellerId);
        conditions.push(`p.seller_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR s.business_name ILIKE $${params.length})`);
      }

      const result = await query(
        `SELECT p.id, p.name, p.slug, p.description, p.category, p.brand, p.price,
                p.currency, p.stock_quantity, p.image_url, p.specifications,
                s.id AS seller_profile_id, s.business_name AS seller_name,
                s.city AS seller_city, s.state AS seller_state, s.logo_url AS seller_logo,
                s.is_verified AS seller_verified
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.created_at DESC`,
        params
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      next(err);
    }
  }

  static async getOne(req, res, next) {
    try {
      const result = await query(
        `SELECT p.*, s.business_name AS seller_name, s.city AS seller_city,
                s.state AS seller_state, s.logo_url AS seller_logo, s.is_verified AS seller_verified
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         WHERE p.id = $1 AND p.is_published = TRUE AND s.status = 'active'`,
        [req.params.id]
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }

  static async sellerProducts(req, res, next) {
    try {
      const result = await query(
        `SELECT p.* FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         WHERE s.user_id = $1 ORDER BY p.created_at DESC`,
        [req.user.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ProductsController;
