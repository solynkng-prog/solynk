const { query } = require('../../config/database');
const logger = require('../../shared/utils/logger');
const { checkPlanLimit } = require('../../shared/constants/plan-limits');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class ReportsController {
  /**
   * POST /exports/pdf
   * Generate PDF report
   */
  static async generatePDF(req, res, next) {
    try {
      const userId = req.user.id;
      const userPlan = req.user.plan;

      // Check plan limit
      const usageResult = await query(
        'SELECT reports_used FROM subscriptions WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      );
      const currentReports = usageResult.rows[0]?.reports_used || 0;

      if (!checkPlanLimit(userPlan, 'reports', currentReports)) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'PLAN_LIMIT_REACHED',
            message: 'Report limit reached. Upgrade for unlimited reports.',
            upgradeUrl: '/billing/upgrade',
          },
        });
      }

      const { projectId, reportType, sections, branding } = req.body;

      // Get project data
      const projectResult = await query(
        `SELECT p.*, u.name as user_name
         FROM projects p
         JOIN users u ON u.id = p.user_id
         WHERE p.id = $1 AND p.user_id = $2`,
        [projectId, userId]
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
        'SELECT * FROM appliances WHERE project_id = $1',
        [projectId]
      );
      project.appliances = appliancesResult.rows;

      // Create report record
      const reportResult = await query(
        `INSERT INTO reports (user_id, project_id, name, type, format, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, projectId, `${project.name} - ${reportType}`, reportType, 'pdf', 'generating']
      );

      const report = reportResult.rows[0];

      // Generate PDF asynchronously (in production, use a job queue)
      this.generatePDFAsync(report, project, sections, branding)
        .catch(err => logger.error('PDF generation failed:', err));

      res.status(202).json({
        success: true,
        data: {
          reportId: report.id,
          status: 'generating',
          message: 'Report is being generated. Check status endpoint.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Async PDF generation
   */
  static async generatePDFAsync(report, project, sections, branding) {
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Generate HTML content
      const html = this.generateReportHTML(report, project, sections, branding);
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
      });

      await browser.close();

      // Save to file (in production, upload to cloud storage)
      const fileName = `report_${report.id}.pdf`;
      const filePath = path.join(process.cwd(), 'uploads', fileName);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, pdfBuffer);

      // Update report status
      await query(
        `UPDATE reports 
         SET status = 'ready', file_url = $1, file_size = $2, generated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [filePath, pdfBuffer.length, report.id]
      );

      // Update usage
      await query(
        'UPDATE subscriptions SET reports_used = reports_used + 1 WHERE user_id = $1 AND status = $2',
        [report.user_id, 'active']
      );

      logger.info('PDF generated', { reportId: report.id });
    } catch (err) {
      await query(
        "UPDATE reports SET status = 'failed' WHERE id = $1",
        [report.id]
      );
      throw err;
    }
  }

  /**
   * Generate report HTML
   */
  static generateReportHTML(report, project, sections, branding) {
    const companyName = branding?.companyName || 'SOLYNK';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.6; }
          .header { text-align: center; padding: 40px 0; border-bottom: 3px solid #6366f1; }
          .header h1 { color: #6366f1; font-size: 32px; margin: 0; }
          .header p { color: #64748b; margin: 8px 0 0; }
          .section { margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 8px; }
          .section h2 { color: #0f172a; font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .stat { padding: 15px; background: white; border-radius: 6px; }
          .stat-label { color: #64748b; font-size: 12px; text-transform: uppercase; }
          .stat-value { color: #0f172a; font-size: 24px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f1f5f9; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${companyName}</h1>
          <p>Solar System Design Report — ${project.name}</p>
          <p style="font-size: 12px; color: #94a3b8;">Generated on ${new Date().toLocaleDateString()}</p>
        </div>

        ${sections.includes('load_analysis') ? `
        <div class="section">
          <h2>Load Analysis</h2>
          <div class="grid">
            <div class="stat">
              <div class="stat-label">Daily Energy Demand</div>
              <div class="stat-value">${project.total_demand_wh?.toLocaleString() || 'N/A'} Wh</div>
            </div>
            <div class="stat">
              <div class="stat-label">Peak Load</div>
              <div class="stat-value">${project.peak_load_w?.toLocaleString() || 'N/A'} W</div>
            </div>
          </div>
          <table>
            <thead><tr><th>Appliance</th><th>Qty</th><th>Watts</th><th>Hours/Day</th><th>Daily Wh</th></tr></thead>
            <tbody>
              ${project.appliances?.map(a => `
                <tr><td>${a.name}</td><td>${a.quantity}</td><td>${a.watts}</td><td>${a.hours_per_day}</td><td>${(a.watts * a.quantity * a.hours_per_day).toLocaleString()}</td></tr>
              `).join('') || ''}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${sections.includes('battery_sizing') ? `
        <div class="section">
          <h2>Battery Bank</h2>
          <div class="grid">
            <div class="stat"><div class="stat-label">Capacity</div><div class="stat-value">${project.battery_ah?.toFixed(2) || 'N/A'} Ah</div></div>
            <div class="stat"><div class="stat-label">Energy Storage</div><div class="stat-value">${project.battery_wh?.toLocaleString() || 'N/A'} Wh</div></div>
            <div class="stat"><div class="stat-label">Voltage</div><div class="stat-value">${project.battery_voltage || 'N/A'}V</div></div>
            <div class="stat"><div class="stat-label">Autonomy</div><div class="stat-value">${project.autonomy_days?.toFixed(1) || 'N/A'} days</div></div>
          </div>
        </div>
        ` : ''}

        ${sections.includes('panel_array') ? `
        <div class="section">
          <h2>Solar Array</h2>
          <div class="grid">
            <div class="stat"><div class="stat-label">Panel Count</div><div class="stat-value">${project.panel_count || 'N/A'}</div></div>
            <div class="stat"><div class="stat-label">Array Size</div><div class="stat-value">${project.array_size_w?.toLocaleString() || 'N/A'} W</div></div>
            <div class="stat"><div class="stat-label">Daily Generation</div><div class="stat-value">${project.daily_generation_wh?.toLocaleString() || 'N/A'} Wh</div></div>
            <div class="stat"><div class="stat-label">Panel Wattage</div><div class="stat-value">${project.panel_wattage || 'N/A'} W</div></div>
          </div>
        </div>
        ` : ''}

        ${sections.includes('cost_breakdown') ? `
        <div class="section">
          <h2>Cost Estimate</h2>
          <div class="stat">
            <div class="stat-label">Total Estimated Cost</div>
            <div class="stat-value">$${project.total_cost?.toLocaleString(undefined, {minimumFractionDigits: 2}) || 'N/A'}</div>
          </div>
        </div>
        ` : ''}

        <div class="footer">
          <p>Generated by SOLYNK Solar Engineering Platform</p>
          <p>This report is for estimation purposes only. Consult a certified installer for final design.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * POST /exports/bom
   * Generate Bill of Materials CSV
   */
  static async generateBOM(req, res, next) {
    try {
      const userId = req.user.id;
      const { projectId } = req.body;

      const projectResult = await query(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' }
        });
      }

      const project = projectResult.rows[0];

      // Generate BOM data
      const bomItems = [
        { category: 'Solar Panels', item: `${project.panel_wattage}W Monocrystalline`, quantity: project.panel_count, unit: 'pcs', notes: 'Tier 1 manufacturer' },
        { category: 'Battery', item: `${project.battery_voltage}V LiFePO4`, quantity: Math.ceil(project.battery_ah / 200), unit: 'pcs', notes: `${project.battery_ah}Ah total` },
        { category: 'Inverter', item: `${Math.ceil(project.inverter_size_w / 1000)}kW Pure Sine Wave`, quantity: 1, unit: 'pcs', notes: 'Hybrid inverter' },
        { category: 'Charge Controller', item: `${Math.ceil(project.controller_a / 10) * 10}A MPPT`, quantity: 1, unit: 'pcs', notes: '' },
        { category: 'Mounting', item: 'Roof Mount Racking System', quantity: project.panel_count, unit: 'sets', notes: 'Aluminum, corrosion resistant' },
        { category: 'Cabling', item: 'PV Cable 4mm²', quantity: Math.ceil(project.panel_count * 10), unit: 'm', notes: 'UV resistant' },
        { category: 'Breakers', item: 'DC Circuit Breaker', quantity: 2, unit: 'pcs', notes: 'Panel and battery side' },
        { category: 'Monitoring', item: 'WiFi Monitoring System', quantity: 1, unit: 'pcs', notes: 'App-based monitoring' },
      ];

      res.json({
        success: true,
        data: {
          projectName: project.name,
          items: bomItems,
          totalItems: bomItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /exports/:id/status
   */
  static async getStatus(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        'SELECT id, name, type, format, status, file_url, file_size, generated_at, created_at FROM reports WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found' }
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
   * GET /exports/:id/download
   */
  static async download(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await query(
        'SELECT * FROM reports WHERE id = $1 AND user_id = $2 AND status = $3',
        [id, userId, 'ready']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found or not ready' }
        });
      }

      const report = result.rows[0];

      // In production, stream from cloud storage
      // For now, send file path or generate on-the-fly
      res.download(report.file_url, `${report.name}.pdf`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /exports
   * List user's reports
   */
  static async list(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = (page - 1) * limit;

      const result = await query(
        `SELECT r.*, p.name as project_name
         FROM reports r
         LEFT JOIN projects p ON p.id = r.project_id
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const countResult = await query(
        'SELECT COUNT(*) FROM reports WHERE user_id = $1',
        [userId]
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
   * DELETE /exports/:id
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      await query(
        'DELETE FROM reports WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      res.json({
        success: true,
        message: 'Report deleted',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReportsController;
