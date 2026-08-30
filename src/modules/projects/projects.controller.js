const { query, transaction } = require('../../config/database');
const logger = require('../../shared/utils/logger');
const { checkPlanLimit } = require('../../shared/constants/plan-limits');

class ProjectsController {
  /**
   * POST /projects
   * Create new project
   */
  static async create(req, res, next) {
    try {
      const userId = req.user.id;
      const userPlan = req.user.plan;

      // Check plan limit
      const usageResult = await query(
        'SELECT COUNT(*) FROM projects WHERE user_id = $1 AND status != $2',
        [userId, 'archived']
      );
      const currentProjects = parseInt(usageResult.rows[0].count);

      if (!checkPlanLimit(userPlan, 'projects', currentProjects)) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'PLAN_LIMIT_REACHED',
            message: `Your ${userPlan} plan allows ${currentProjects} projects. Upgrade for unlimited projects.`,
            upgradeUrl: '/billing/upgrade',
          },
        });
      }

      const {
        name,
        description,
        systemType,
        batteryType,
        batteryVoltage,
        backupHours,
        peakSunHours,
        panelWattage,
        inverterEff,
        systemLosses,
        ambientTemp,
        tempCoefficient,
        wiringLoss,
        soilingLoss,
        totalDemandWh,
        peakLoadW,
        batteryAh,
        batteryWh,
        panelCount,
        arraySizeW,
        dailyGenerationWh,
        inverterSizeW,
        controllerA,
        autonomyDays,
        totalCost,
        appliances,
        isPublic,
        tags,
      } = req.body;

      const result = await transaction(async (client) => {
        // Insert project
        const projectResult = await client.query(
          `INSERT INTO projects (
            user_id, name, description, system_type, battery_type, battery_voltage,
            backup_hours, peak_sun_hours, panel_wattage, inverter_eff, system_losses,
            ambient_temp, temp_coefficient, wiring_loss, soiling_loss,
            total_demand_wh, peak_load_w, battery_ah, battery_wh,
            panel_count, array_size_w, daily_generation_wh,
            inverter_size_w, controller_a, autonomy_days, total_cost,
            is_public, tags, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
          RETURNING *`,
          [
            userId, name, description, systemType, batteryType, batteryVoltage,
            backupHours, peakSunHours, panelWattage, inverterEff, systemLosses,
            ambientTemp, tempCoefficient, wiringLoss, soilingLoss,
            totalDemandWh, peakLoadW, batteryAh, batteryWh,
            panelCount, arraySizeW, dailyGenerationWh,
            inverterSizeW, controllerA, autonomyDays, totalCost,
            isPublic || false, tags || [], 'completed',
          ]
        );

        const project = projectResult.rows[0];

        // Insert appliances
        if (appliances && Array.isArray(appliances)) {
          for (const app of appliances) {
            await client.query(
              `INSERT INTO appliances (project_id, name, quantity, watts, hours_per_day)
               VALUES ($1, $2, $3, $4, $5)`,
              [project.id, app.name, app.quantity, app.watts, app.hoursPerDay]
            );
          }
        }

        // Update subscription usage
        await client.query(
          'UPDATE subscriptions SET projects_used = projects_used + 1 WHERE user_id = $1 AND status = $2',
          [userId, 'active']
        );

        // Log activity
        await client.query(
          `INSERT INTO activity_logs (user_id, entity_type, entity_id, action, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, 'project', project.id, 'created', { name }]
        );

        return project;
      });

      logger.info('Project created', { userId, projectId: result.id });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /projects
   * List user's projects
   */
  static async list(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = (page - 1) * limit;
      const sort = req.query.sort || 'updated_at';
      const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
      const status = req.query.status;
      const systemType = req.query.system_type;

      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      let paramCount = 2;

      if (status) {
        whereClause += ` AND status = $${paramCount++}`;
        params.push(status);
      }
      if (systemType) {
        whereClause += ` AND system_type = $${paramCount++}`;
        params.push(systemType);
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT * FROM projects ${whereClause}
         ORDER BY ${sort} ${order}
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM projects ${whereClause}`,
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
   * GET /projects/:id
   * Get single project with appliances
   */
  static async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const projectResult = await query(
        'SELECT * FROM projects WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)',
        [id, userId]
      );

      if (projectResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      const project = projectResult.rows[0];

      // Get appliances
      const appliancesResult = await query(
        'SELECT * FROM appliances WHERE project_id = $1 ORDER BY created_at',
        [id]
      );

      project.appliances = appliancesResult.rows;

      res.json({
        success: true,
        data: project,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /projects/:id
   * Update project
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verify ownership
      const checkResult = await query(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      const allowedFields = [
        'name', 'description', 'system_type', 'battery_type', 'battery_voltage',
        'backup_hours', 'peak_sun_hours', 'panel_wattage', 'inverter_eff',
        'system_losses', 'ambient_temp', 'temp_coefficient', 'wiring_loss',
        'soiling_loss', 'is_public', 'tags', 'status',
      ];

      const updates = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(req.body)) {
        const dbField = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        if (allowedFields.includes(dbField) && value !== undefined) {
          updates.push(`${dbField} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
        });
      }

      values.push(id);

      const result = await query(
        `UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount} RETURNING *`,
        values
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /projects/:id
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      res.json({
        success: true,
        message: 'Project deleted',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /projects/:id/duplicate
   */
  static async duplicate(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const original = await query(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (original.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      const project = original.rows[0];
      const appliances = await query(
        'SELECT name, quantity, watts, hours_per_day FROM appliances WHERE project_id = $1',
        [id]
      );

      const result = await transaction(async (client) => {
        const newProject = await client.query(
          `INSERT INTO projects (
            user_id, name, description, system_type, battery_type, battery_voltage,
            backup_hours, peak_sun_hours, panel_wattage, inverter_eff, system_losses,
            ambient_temp, temp_coefficient, wiring_loss, soiling_loss,
            total_demand_wh, peak_load_w, battery_ah, battery_wh,
            panel_count, array_size_w, daily_generation_wh,
            inverter_size_w, controller_a, autonomy_days, total_cost,
            is_public, tags, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
          RETURNING *`,
          [
            userId, `${project.name} (Copy)`, project.description, project.system_type,
            project.battery_type, project.battery_voltage, project.backup_hours,
            project.peak_sun_hours, project.panel_wattage, project.inverter_eff,
            project.system_losses, project.ambient_temp, project.temp_coefficient,
            project.wiring_loss, project.soiling_loss, project.total_demand_wh,
            project.peak_load_w, project.battery_ah, project.battery_wh,
            project.panel_count, project.array_size_w, project.daily_generation_wh,
            project.inverter_size_w, project.controller_a, project.autonomy_days,
            project.total_cost, false, project.tags, 'draft',
          ]
        );

        for (const app of appliances.rows) {
          await client.query(
            `INSERT INTO appliances (project_id, name, quantity, watts, hours_per_day)
             VALUES ($1, $2, $3, $4, $5)`,
            [newProject.rows[0].id, app.name, app.quantity, app.watts, app.hours_per_day]
          );
        }

        return newProject.rows[0];
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /projects/:id/share
   */
  static async share(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        `UPDATE projects SET is_public = TRUE, status = 'shared'
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      const shareUrl = `https://solynk.com/projects/${id}`;

      res.json({
        success: true,
        data: {
          shareUrl,
          project: result.rows[0],
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /projects/public
   * Browse public community projects
   */
  static async listPublic(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = (page - 1) * limit;
      const systemType = req.query.system_type;

      let whereClause = 'WHERE is_public = TRUE AND status = $1';
      const params = ['shared'];
      let paramCount = 2;

      if (systemType) {
        whereClause += ` AND system_type = $${paramCount++}`;
        params.push(systemType);
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT p.*, u.name as author_name
         FROM projects p
         JOIN users u ON u.id = p.user_id
         ${whereClause}
         ORDER BY p.updated_at DESC
         LIMIT $${paramCount++} OFFSET $${paramCount++}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM projects ${whereClause}`,
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
}

module.exports = ProjectsController;
