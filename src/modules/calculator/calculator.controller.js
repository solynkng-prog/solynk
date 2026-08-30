const SolarEngine = require('./solar-engine');
const { query } = require('../../config/database');
const redis = require('../../config/redis');
const logger = require('../../shared/utils/logger');
const { checkPlanLimit } = require('../../shared/constants/plan-limits');

class CalculatorController {
  /**
   * POST /calculate
   * Run full solar system calculation
   */
  static async calculate(req, res, next) {
    try {
      const { appliances, config } = req.body;

      if (!appliances || !Array.isArray(appliances) || appliances.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'At least one appliance is required' }
        });
      }

      // Validate appliances
      for (const app of appliances) {
        if (!app.watts || app.watts <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: `Invalid wattage for ${app.name || 'appliance'}` }
          });
        }
      }

      // Run calculation
      const result = SolarEngine.calculate({ appliances, config });

      // Log calculation for analytics
      if (req.user) {
        await query(
          `INSERT INTO calculation_logs (user_id, total_demand_wh, peak_load_w, system_type, results, execution_time_ms)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.id,
            result.data.loadAnalysis.totalWh,
            result.data.loadAnalysis.peakLoad,
            config?.systemType || 'hybrid',
            JSON.stringify(result.data),
            result.meta.executionTimeMs,
          ]
        );

        // Increment calculation usage
        await query(
          'UPDATE subscriptions SET calculations_used = calculations_used + 1 WHERE user_id = $1 AND status = $2',
          [req.user.id, 'active']
        );
      }

      logger.info('Calculation completed', {
        userId: req.user?.id,
        appliances: appliances.length,
        executionTime: result.meta.executionTimeMs,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /calculate/optimize
   * AI-optimized system design
   */
  static async optimize(req, res, next) {
    try {
      const { appliances, config, goals, constraints } = req.body;

      if (!appliances || !Array.isArray(appliances)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Appliances array required' }
        });
      }

      const result = SolarEngine.optimize({ appliances, config }, goals || ['maximize_efficiency']);

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /calculate/history
   * User's calculation history
   */
  static async getHistory(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = (page - 1) * limit;

      const result = await query(
        `SELECT id, total_demand_wh, peak_load_w, system_type, results, execution_time_ms, created_at
         FROM calculation_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      const countResult = await query(
        'SELECT COUNT(*) FROM calculation_logs WHERE user_id = $1',
        [req.user.id]
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
   * GET /calculate/defaults
   * Get default calculation parameters
   */
  static async getDefaults(req, res, next) {
    try {
      const defaults = {
        systemType: 'hybrid',
        batteryType: 'lithium',
        batteryVoltage: 48,
        backupHours: 24,
        peakSunHours: 5.5,
        panelWattage: 550,
        inverterEff: 95,
        systemLosses: 15,
        ambientTemp: 30,
        tempCoefficient: -0.40,
        wiringLoss: 2,
        soilingLoss: 3,
        controllerType: 'mppt',
      };

      // Try to get location-based sun hours
      if (req.user?.location) {
        const cached = await redis.get(`sunhours:${req.user.location}`);
        if (cached) {
          defaults.peakSunHours = parseFloat(cached);
        }
      }

      res.json({
        success: true,
        data: defaults,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CalculatorController;
