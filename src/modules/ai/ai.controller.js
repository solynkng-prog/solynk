const { query } = require('../../config/database');
const logger = require('../../shared/utils/logger');
const SolarEngine = require('../calculator/solar-engine');
const { OpenAI } = require('openai');

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const FALLBACK_GROQ_MODELS = ['qwen/qwen3.8-27b', 'groq/compound', 'llama-3.3-70b-versatile'];
const GROQ_MODEL = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      base_url: 'https://api.groq.com/openai/v1',
    })
  : null;

const getGroqModelCandidates = () => {
  const configured = process.env.GROQ_MODEL;
  const candidates = [];

  if (configured) candidates.push(configured);
  for (const model of FALLBACK_GROQ_MODELS) {
    if (!candidates.includes(model)) candidates.push(model);
  }
  if (!candidates.includes(DEFAULT_GROQ_MODEL)) candidates.push(DEFAULT_GROQ_MODEL);

  return candidates;
};

const createGroqChatCompletion = async (payload) => {
  if (!groqClient) {
    throw new Error('Groq is not configured.');
  }

  let lastError;
  for (const model of getGroqModelCandidates()) {
    try {
      return await groqClient.chat.completions.create({ ...payload, model });
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.statusCode || err?.code;
      if (status !== 404 && status !== 400) {
        throw err;
      }
      logger.warn(`Groq model '${model}' is unavailable; trying next fallback.`, {
        status,
        message: err.message,
      });
    }
  }

  throw lastError || new Error('Groq completion failed.');
};

class AIController {
  /**
   * POST /ai/optimize
   * AI system optimization
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

      // Run base calculation
      const baseResult = SolarEngine.calculate({ appliances, config });

      // Generate AI recommendations
      const recommendations = this.generateRecommendations(baseResult, goals, constraints);

      // Try Groq enhancement if available
      let aiInsights = null;
      if (groqClient) {
        try {
          aiInsights = await this.getGroqInsights(baseResult, goals, constraints);
        } catch (err) {
          logger.warn('Groq enhancement failed, using rule-based:', err.message);
        }
      }

      res.json({
        success: true,
        data: {
          baseSystem: baseResult.data,
          recommendations,
          aiInsights: aiInsights || this.generateRuleBasedInsights(baseResult, goals),
          optimizedConfig: this.generateOptimizedConfig(baseResult, recommendations),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ai/recommend
   * Equipment recommendations
   */
  static async recommend(req, res, next) {
    try {
      const { systemType, budget, location, roofArea, energyGoal } = req.body;

      const recommendations = {
        panels: this.recommendPanels(systemType, budget, roofArea),
        batteries: this.recommendBatteries(systemType, budget, energyGoal),
        inverters: this.recommendInverters(systemType, budget),
        controllers: this.recommendControllers(systemType, budget),
      };

      res.json({
        success: true,
        data: recommendations,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /ai/chat
   * AI assistant conversation
   */
  static async chat(req, res, next) {
    try {
      const { message, context, projectId } = req.body;
      const userId = req.user?.id;

      let projectContext = '';
      if (projectId && userId) {
        const projectResult = await query(
          'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
          [projectId, userId]
        );
        if (projectResult.rows.length > 0) {
          const p = projectResult.rows[0];
          projectContext = `Project: ${p.name}, System: ${p.system_type}, ${p.panel_count} panels, ${p.battery_ah}Ah battery, ${p.total_cost} cost.`;
        }
      }

      // Try Groq
      if (groqClient) {
        const completion = await createGroqChatCompletion({
          messages: [
            {
              role: 'system',
              content: `You are a Groq-powered solar engineering assistant. Help users design, optimize, and understand solar power systems. Be technical but accessible, concise, and practical. ${projectContext}`
            },
            ...(context || []).map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            { role: 'user', content: message },
          ],
          max_tokens: 500,
          temperature: 0.7,
        });

        return res.json({
          success: true,
          data: {
            response: completion.choices[0].message.content,
            model: GROQ_MODEL,
            tokens: completion.usage?.total_tokens,
          },
        });
      }

      // Fallback: rule-based responses
      const fallbackResponse = this.getFallbackResponse(message, projectContext);
      res.json({
        success: true,
        data: {
          response: fallbackResponse,
          model: 'solynk-rule-based',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /ai/suggestions/:projectId
   * Context-aware suggestions
   */
  static async getSuggestions(req, res, next) {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;

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
      const suggestions = [];

      // Suggestion 1: Battery autonomy check
      if (project.autonomy_days < 1.5) {
        suggestions.push({
          type: 'warning',
          category: 'battery',
          title: 'Low Battery Autonomy',
          message: `Your system has only ${project.autonomy_days?.toFixed(1)} days of autonomy. Consider increasing battery capacity for better reliability.`,
          action: 'Increase backup hours or battery capacity',
        });
      }

      // Suggestion 2: Panel oversizing check
      if (project.daily_generation_wh < project.total_demand_wh * 1.2) {
        suggestions.push({
          type: 'warning',
          category: 'solar',
          title: 'Tight Generation Margin',
          message: 'Your solar array may not produce enough energy during cloudy periods.',
          action: 'Add 1-2 extra panels for safety margin',
        });
      }

      // Suggestion 3: Cost optimization
      if (project.total_cost > 30000) {
        suggestions.push({
          type: 'tip',
          category: 'cost',
          title: 'High System Cost',
          message: 'Your system cost is above average. Consider reducing peak loads or using more efficient equipment.',
          action: 'Review appliance list for energy efficiency upgrades',
        });
      }

      // Suggestion 4: Inverter sizing
      if (project.inverter_size_w < project.peak_load_w * 1.25) {
        suggestions.push({
          type: 'critical',
          category: 'inverter',
          title: 'Undersized Inverter',
          message: 'Your inverter may not handle peak loads safely.',
          action: 'Upgrade inverter size immediately',
        });
      }

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (err) {
      next(err);
    }
  }

  // ============== HELPER METHODS ==============

  static generateRecommendations(baseResult, goals = [], constraints = {}) {
    const recommendations = [];
    const data = baseResult.data;

    if (goals.includes('maximize_efficiency')) {
      const tempLoss = data.lossAnalysis.components.temperature.percent;
      if (tempLoss > 15) {
        recommendations.push({
          type: 'panel_upgrade',
          priority: 'medium',
          current: `${data.solarArray.panelWattage}W standard`,
          recommended: 'Bifacial or HJT panels with lower temp coefficient',
          impact: '-3-5% temperature loss',
          costDelta: data.solarArray.panelCount * 80,
          reason: 'High ambient temperature causing significant losses',
        });
      }
    }

    if (goals.includes('extend_autonomy')) {
      const currentAutonomy = data.batteryBank.autonomyDays;
      if (currentAutonomy < 2) {
        recommendations.push({
          type: 'battery_upgrade',
          priority: 'high',
          current: `${data.batteryBank.capacityAh}Ah`,
          recommended: `${Math.ceil(data.batteryBank.capacityAh * 1.5)}Ah`,
          impact: `+${(data.batteryBank.autonomyDays * 0.5).toFixed(1)} days autonomy`,
          costDelta: data.batteryBank.batteryCount * 600,
          reason: 'Low autonomy for off-grid reliability',
        });
      }
    }

    if (goals.includes('minimize_cost')) {
      const perWattCost = data.costEstimate.perWatt;
      if (perWattCost > 3.5) {
        recommendations.push({
          type: 'cost_reduction',
          priority: 'medium',
          suggestion: 'Consider DIY installation or local installer quotes',
          potentialSavings: data.costEstimate.breakdown.labor.amount * 0.3,
          reason: 'Labor costs are above market average',
        });
      }
    }

    if (constraints?.maxBudget && data.costEstimate.total > constraints.maxBudget) {
      recommendations.push({
        type: 'budget_adjustment',
        priority: 'high',
        current: `$${data.costEstimate.total.toLocaleString()}`,
        target: `$${constraints.maxBudget.toLocaleString()}`,
        suggestedActions: [
          'Reduce battery capacity by 20%',
          'Use lower-wattage panels',
          'Eliminate non-essential loads',
        ],
      });
    }

    return recommendations;
  }

  static async getGroqInsights(baseResult, goals, constraints) {
    const prompt = `Analyze this solar system design and provide 3 specific optimization recommendations:

System: ${baseResult.data.systemConfig.systemType}
Daily Load: ${baseResult.data.loadAnalysis.totalWh}Wh
Peak Load: ${baseResult.data.loadAnalysis.peakLoad}W
Panels: ${baseResult.data.solarArray.panelCount} × ${baseResult.data.solarArray.panelWattage}W
Battery: ${baseResult.data.batteryBank.capacityAh}Ah @ ${baseResult.data.batteryBank.batteryVoltage}V
Inverter: ${baseResult.data.powerElectronics.recommendedInverter}W
Total Cost: $${baseResult.data.costEstimate.total.toLocaleString()}
Goals: ${goals?.join(', ') || 'general optimization'}
Constraints: ${constraints ? JSON.stringify(constraints) : 'none'}

Provide concise, actionable recommendations with estimated impact.`;

    const completion = await createGroqChatCompletion({
      messages: [
        { role: 'system', content: 'You are a solar engineering optimization expert.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.5,
    });

    return completion.choices[0].message.content;
  }

  static generateRuleBasedInsights(baseResult, goals) {
    const insights = [];
    const data = baseResult.data;

    if (data.solarArray.dailyGenerationWh > data.loadAnalysis.totalWh * 1.5) {
      insights.push('Your solar array is well-sized with a healthy generation margin.');
    }

    if (data.batteryBank.autonomyDays >= 2) {
      insights.push('Battery autonomy is good for off-grid or backup scenarios.');
    }

    if (data.costEstimate.perWatt < 3.0) {
      insights.push('Your cost per watt is competitive.');
    }

    return insights;
  }

  static generateOptimizedConfig(baseResult, recommendations) {
    // Apply highest priority recommendations to generate optimized config
    const config = { ...baseResult.data.systemConfig };

    for (const rec of recommendations) {
      if (rec.priority === 'high' && rec.type === 'battery_upgrade') {
        config.backupHours = Math.ceil(config.backupHours * 1.3);
      }
      if (rec.priority === 'high' && rec.type === 'panel_upgrade') {
        config.panelWattage = Math.min(config.panelWattage + 50, 700);
      }
    }

    return config;
  }

  static recommendPanels(systemType, budget, roofArea) {
    const options = [
      { model: 'Jinko Tiger Neo 550W', efficiency: 21.3, price: 247, bestFor: 'budget' },
      { model: 'LONGi Hi-MO 6 600W', efficiency: 22.1, price: 285, bestFor: 'efficiency' },
      { model: 'Canadian Solar TOPBiHiKu7 700W', efficiency: 22.8, price: 340, bestFor: 'high-output' },
      { model: 'SunPower Maxeon 6 440W', efficiency: 22.8, price: 420, bestFor: 'premium' },
    ];

    return options.filter(o => {
      if (budget && budget < 15000) return o.bestFor === 'budget';
      if (budget && budget > 30000) return o.bestFor !== 'budget';
      return true;
    });
  }

  static recommendBatteries(systemType, budget, energyGoal) {
    const options = [
      { model: 'EG4 LifePower4 48V 100Ah', capacity: 4800, cycles: 7000, price: 1500, type: 'budget' },
      { model: 'SOK 48V 100Ah Server Rack', capacity: 4800, cycles: 8000, price: 1800, type: 'value' },
      { model: 'Tesla Powerwall 3', capacity: 13500, cycles: 10000, price: 8500, type: 'premium' },
      { model: 'BYD Battery-Box Premium', capacity: 10200, cycles: 10000, price: 6200, type: 'premium' },
    ];

    return options.filter(o => {
      if (systemType === 'offgrid' && o.capacity < 5000) return false;
      if (budget && budget < 10000) return o.type !== 'premium';
      return true;
    });
  }

  static recommendInverters(systemType, budget) {
    const options = [
      { model: 'Growatt SPF 5000TL', type: 'hybrid', power: 5000, price: 1200, bestFor: 'budget' },
      { model: 'Victron MultiPlus-II 48/5000', type: 'hybrid', power: 5000, price: 2200, bestFor: 'quality' },
      { model: 'SMA Sunny Boy 5.0', type: 'gridtie', power: 5000, price: 1800, bestFor: 'gridtie' },
      { model: 'Schneider Conext XW+ 6848', type: 'offgrid', power: 6800, price: 3500, bestFor: 'offgrid' },
    ];

    return options.filter(o => {
      if (systemType === 'offgrid' && o.type !== 'offgrid' && o.type !== 'hybrid') return false;
      if (budget && budget < 8000) return o.bestFor === 'budget';
      return true;
    });
  }

  static recommendControllers(systemType, budget) {
    const options = [
      { model: 'EPEVER MPPT 60A', type: 'mppt', current: 60, price: 180, bestFor: 'budget' },
      { model: 'Victron SmartSolar MPPT 100/50', type: 'mppt', current: 50, price: 350, bestFor: 'quality' },
      { model: 'Morningstar TriStar MPPT 60', type: 'mppt', current: 60, price: 520, bestFor: 'premium' },
    ];

    return options;
  }

  static getFallbackResponse(message, context) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('battery') || lowerMsg.includes('storage')) {
      return `For your system${context ? ' (' + context + ')' : ''}, I recommend LiFePO4 batteries for their 90% depth of discharge and 10-15 year lifespan. Lead acid is cheaper but only provides 50% usable capacity. Would you like a detailed battery sizing calculation?`;
    }

    if (lowerMsg.includes('panel') || lowerMsg.includes('solar')) {
      return `Monocrystalline panels offer the best efficiency (20-22%) and are ideal for limited roof space. For your location, I can calculate optimal panel count based on your daily energy needs and peak sun hours. Would you like me to run the calculation?`;
    }

    if (lowerMsg.includes('cost') || lowerMsg.includes('price') || lowerMsg.includes('budget')) {
      return `Solar system costs vary by size and location. A typical residential system costs $2.50-$4.00 per watt before incentives. The 30% federal tax credit significantly reduces net cost. Would you like a detailed cost breakdown for your project?`;
    }

    if (lowerMsg.includes('inverter')) {
      return `Your inverter should handle your peak load plus a 25% safety margin. For off-grid systems, I recommend pure sine wave inverters. Hybrid inverters work best if you have grid access and want battery backup. What's your peak load?`;
    }

    return `I can help you with solar system design, equipment selection, cost estimation, and optimization. ${context ? 'I see you have a project in progress. ' : ''}What specific aspect would you like to explore?`;
  }
}

module.exports = AIController;
