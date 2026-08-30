/**
 * SOLYNK Solar Calculation Engine
 * Implements industry-standard solar system sizing formulas
 * 
 * Formulas based on:
 * - NEC Article 690 (Solar PV Systems)
 * - IEEE 1547 (Interconnection Standards)
 * - ASHRAE/SEI standards
 */

const SOLAR_CONSTANTS = require('../../shared/constants/solar-constants');

class SolarEngine {
  /**
   * Main calculation entry point
   * @param {Object} params - Calculation parameters
   * @returns {Object} Complete system design results
   */
  static calculate(params) {
    const startTime = Date.now();

    // ===== A. LOAD ANALYSIS =====
    const loadAnalysis = this.calculateLoad(params.appliances);

    // ===== B. SYSTEM CONFIGURATION =====
    const config = this.normalizeConfig(params.config);

    // ===== C. LOSS CORRECTIONS =====
    const losses = this.calculateLosses(config);

    // ===== D. ADJUSTED DEMAND =====
    const adjustedDemand = this.calculateAdjustedDemand(loadAnalysis.totalWh, losses);

    // ===== E. BATTERY SIZING =====
    const batteryBank = this.calculateBatteryBank(adjustedDemand, config);

    // ===== F. SOLAR ARRAY SIZING =====
    const solarArray = this.calculateSolarArray(adjustedDemand, config, losses);

    // ===== G. POWER ELECTRONICS =====
    const powerElectronics = this.calculatePowerElectronics(loadAnalysis.peakLoad, solarArray, config);

    // ===== H. COST ESTIMATION =====
    const costEstimate = this.calculateCosts(solarArray, batteryBank, powerElectronics);

    // ===== I. FINANCIAL PROJECTION =====
    const financialProjection = this.calculateFinancials(costEstimate.total, config);

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      meta: {
        executionTimeMs: executionTime,
        version: '2.0.0',
        standards: ['NEC-690', 'IEEE-1547'],
      },
      data: {
        loadAnalysis,
        systemConfig: config,
        lossAnalysis: losses,
        batteryBank,
        solarArray,
        powerElectronics,
        costEstimate,
        financialProjection,
      },
    };
  }

  /**
   * A. LOAD ANALYSIS
   * Formula: Total Load = Σ(Watts × Quantity × Hours)
   */
  static calculateLoad(appliances) {
    let totalWh = 0;
    let peakLoad = 0;
    const breakdown = [];

    for (const app of appliances) {
      const qty = parseFloat(app.quantity) || 1;
      const watts = parseFloat(app.watts) || 0;
      const hours = parseFloat(app.hoursPerDay) || 0;

      const wh = watts * qty * hours;
      totalWh += wh;
      peakLoad += watts * qty;

      breakdown.push({
        name: app.name || 'Unnamed',
        quantity: qty,
        watts,
        hoursPerDay: hours,
        dailyWh: wh,
        percentageOfTotal: 0, // calculated below
      });
    }

    // Calculate percentages
    for (const item of breakdown) {
      item.percentageOfTotal = totalWh > 0 
        ? parseFloat(((item.dailyWh / totalWh) * 100).toFixed(2)) 
        : 0;
    }

    // Sort by energy consumption (descending)
    breakdown.sort((a, b) => b.dailyWh - a.dailyWh);

    return {
      totalWh: parseFloat(totalWh.toFixed(2)),
      peakLoad: parseFloat(peakLoad.toFixed(2)),
      applianceCount: appliances.length,
      breakdown,
    };
  }

  /**
   * Normalize and validate configuration
   */
  static normalizeConfig(config = {}) {
    return {
      systemType: config.systemType || 'hybrid',
      batteryType: config.batteryType || 'lithium',
      batteryVoltage: parseInt(config.batteryVoltage) || 48,
      backupHours: parseFloat(config.backupHours) || 24,
      peakSunHours: parseFloat(config.peakSunHours) || 5.5,
      panelWattage: parseInt(config.panelWattage) || 550,
      inverterEff: parseFloat(config.inverterEff) || 95,
      systemLosses: parseFloat(config.systemLosses) || 15,
      ambientTemp: parseFloat(config.ambientTemp) || 30,
      tempCoefficient: parseFloat(config.tempCoefficient) || -0.40,
      wiringLoss: parseFloat(config.wiringLoss) || 2,
      soilingLoss: parseFloat(config.soilingLoss) || 3,
      controllerType: config.controllerType || 'mppt',
    };
  }

  /**
   * C. LOSS CORRECTIONS
   * Real-world derating factors
   */
  static calculateLosses(config) {
    // Panel cell temperature = Ambient + NOCT rise
    const panelTemp = config.ambientTemp + SOLAR_CONSTANTS.NOCT_TEMP_RISE;
    const tempRise = panelTemp - SOLAR_CONSTANTS.STC_TEMPERATURE;

    // Temperature loss: |coefficient| × temp rise
    const tempLossPercent = Math.abs(config.tempCoefficient) * tempRise;
    const tempLoss = tempLossPercent / 100;

    // Fixed loss components
    const wiringLoss = config.wiringLoss / 100;
    const soilingLoss = config.soilingLoss / 100;
    const mismatchLoss = SOLAR_CONSTANTS.LOSSES.MISMATCH;
    const inverterLoss = (100 - config.inverterEff) / 100;
    const userSystemLoss = config.systemLosses / 100;

    // Combined system efficiency (multiplicative)
    const totalEfficiency = (1 - wiringLoss) * 
                            (1 - soilingLoss) * 
                            (1 - mismatchLoss) * 
                            (1 - tempLoss) * 
                            (1 - inverterLoss) * 
                            (1 - userSystemLoss);

    // Loss factor for sizing (how much extra capacity needed)
    const lossFactor = 1 / totalEfficiency;

    return {
      components: {
        wiring: { percent: wiringLoss * 100, description: 'DC cable voltage drop' },
        soiling: { percent: soilingLoss * 100, description: 'Dirt/dust accumulation' },
        mismatch: { percent: mismatchLoss * 100, description: 'Panel mismatch & aging' },
        temperature: { 
          percent: tempLossPercent, 
          description: `Cell temp ${panelTemp}°C (${tempRise}°C rise)`,
          panelTemp,
        },
        inverter: { percent: inverterLoss * 100, description: 'Inverter conversion loss' },
        userDefined: { percent: config.systemLosses, description: 'User-defined system losses' },
      },
      totalEfficiency: parseFloat((totalEfficiency * 100).toFixed(2)),
      lossFactor: parseFloat(lossFactor.toFixed(4)),
    };
  }

  /**
   * D. ADJUSTED DEMAND
   * Daily energy demand WITH losses
   */
  static calculateAdjustedDemand(totalWh, losses) {
    const adjustedWh = totalWh * losses.lossFactor;

    return {
      rawDemandWh: totalWh,
      adjustedDemandWh: parseFloat(adjustedWh.toFixed(2)),
      efficiency: losses.totalEfficiency,
    };
  }

  /**
   * E. BATTERY SIZING
   * Formula: Battery Capacity = (Daily Load × Backup Hours) ÷ (Voltage × DoD)
   */
  static calculateBatteryBank(adjustedDemand, config) {
    const dod = SOLAR_CONSTANTS.BATTERY_DOD[config.batteryType] || 0.90;

    // Battery energy needed to cover backup period at full load
    const dailyLoadWh = adjustedDemand.adjustedDemandWh;
    const backupEnergyWh = dailyLoadWh * (config.backupHours / 24);

    // Battery Ah = Energy (Wh) ÷ (Voltage × DoD)
    const batteryAh = backupEnergyWh / (config.batteryVoltage * dod);

    // Total energy storage capacity
    const batteryWh = batteryAh * config.batteryVoltage;

    // Autonomy = how many days battery can support at full daily load
    const autonomyDays = (batteryWh * dod) / dailyLoadWh;

    // Number of battery units (200Ah each)
    const batteryUnitCapacity = SOLAR_CONSTANTS.BATTERY_UNIT_CAPACITY;
    const batteryCount = Math.max(1, Math.ceil(batteryAh / batteryUnitCapacity));

    // Recommended configuration
    const recommendedConfig = this.getBatteryConfig(batteryCount, config.batteryVoltage, config.batteryType);

    return {
      capacityAh: parseFloat(batteryAh.toFixed(2)),
      energyWh: parseFloat(batteryWh.toFixed(2)),
      usableEnergyWh: parseFloat((batteryWh * dod).toFixed(2)),
      autonomyDays: parseFloat(autonomyDays.toFixed(2)),
      batteryCount,
      batteryUnitCapacity,
      depthOfDischarge: parseFloat((dod * 100).toFixed(1)),
      batteryType: config.batteryType,
      batteryVoltage: config.batteryVoltage,
      recommendedConfig,
    };
  }

  /**
   * Get battery configuration string
   */
  static getBatteryConfig(count, voltage, type) {
    const typeNames = {
      leadacid: 'Lead Acid',
      agm: 'AGM',
      gel: 'Gel',
      lithium: 'LiFePO4',
    };

    const seriesCount = voltage / 12; // Assuming 12V units
    const parallelCount = Math.ceil(count / seriesCount);

    return `${count}× ${typeNames[type]} ${voltage}V (${seriesCount}S${parallelCount}P)`;
  }

  /**
   * F. SOLAR ARRAY SIZING
   * Formula: Panel Capacity = Daily Load ÷ Peak Sun Hours
   */
  static calculateSolarArray(adjustedDemand, config, losses) {
    const dailyLoadWh = adjustedDemand.adjustedDemandWh;
    const peakSunHours = config.peakSunHours;
    const panelWattage = config.panelWattage;

    // Panel cell temperature
    const panelTemp = config.ambientTemp + SOLAR_CONSTANTS.NOCT_TEMP_RISE;
    const tempRise = panelTemp - SOLAR_CONSTANTS.STC_TEMPERATURE;
    const tempLoss = Math.abs(config.tempCoefficient) * tempRise / 100;

    // Actual panel output at operating temperature
    const deratedOutput = panelWattage * (1 - tempLoss);

    // Required panel STC rating to meet daily demand
    const requiredPanelWattsSTC = dailyLoadWh / peakSunHours;

    // Number of panels = required STC capacity ÷ actual output per panel
    const panelCount = Math.ceil(requiredPanelWattsSTC / deratedOutput);

    // Total array STC rating
    const arraySizeW = panelCount * panelWattage;

    // Array current at MPP
    const voltageFactor = config.controllerType === 'mppt' 
      ? SOLAR_CONSTANTS.CONTROLLER.MPPT_VOLTAGE_FACTOR 
      : SOLAR_CONSTANTS.CONTROLLER.PWM_VOLTAGE_FACTOR;
    const arrayVoltageMPP = config.batteryVoltage * voltageFactor;
    const arrayCurrent = arraySizeW / arrayVoltageMPP;

    // Daily generation = Array Size × Peak Sun Hours × System Efficiency
    const dailyGeneration = arraySizeW * peakSunHours * (losses.totalEfficiency / 100);

    // Roof area estimate (approx 2.5 m² per 550W panel)
    const roofArea = panelCount * 2.5;

    return {
      panelCount,
      panelWattage,
      arraySizeW,
      deratedOutputPerPanel: parseFloat(deratedOutput.toFixed(2)),
      arrayVoltageMPP: parseFloat(arrayVoltageMPP.toFixed(2)),
      arrayCurrent: parseFloat(arrayCurrent.toFixed(2)),
      dailyGenerationWh: parseFloat(dailyGeneration.toFixed(2)),
      peakSunHours,
      roofAreaSqM: parseFloat(roofArea.toFixed(2)),
      temperature: {
        cellTemp: panelTemp,
        tempRise,
        tempLossPercent: parseFloat((tempLoss * 100).toFixed(2)),
      },
    };
  }

  /**
   * G. POWER ELECTRONICS
   */
  static calculatePowerElectronics(peakLoad, solarArray, config) {
    // Inverter: Peak Load × 1.25 (25% safety margin)
    const inverterSize = peakLoad * SOLAR_CONSTANTS.SAFETY_MARGIN.INVERTER;

    // Round up to nearest standard size
    const standardInverterSizes = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000];
    const recommendedInverter = standardInverterSizes.find(s => s >= inverterSize) || 
                                   Math.ceil(inverterSize / 1000) * 1000;

    // Charge Controller: Array Current × 1.25 (NEC safety factor)
    const controllerSize = solarArray.arrayCurrent * SOLAR_CONSTANTS.SAFETY_MARGIN.CONTROLLER;

    // Round up to nearest standard controller size
    const standardControllerSizes = [30, 40, 50, 60, 80, 100];
    const recommendedController = standardControllerSizes.find(s => s >= controllerSize) || 
                                   Math.ceil(controllerSize / 10) * 10;

    return {
      peakLoad,
      inverterSize: parseFloat(inverterSize.toFixed(2)),
      recommendedInverter,
      inverterType: 'Pure Sine Wave',
      controllerSize: parseFloat(controllerSize.toFixed(2)),
      recommendedController,
      controllerType: config.controllerType.toUpperCase(),
      safetyMargin: `${((SOLAR_CONSTANTS.SAFETY_MARGIN.INVERTER - 1) * 100).toFixed(0)}%`,
    };
  }

  /**
   * H. COST ESTIMATION
   */
  static calculateCosts(solarArray, batteryBank, powerElectronics) {
    const costs = SOLAR_CONSTANTS.COSTS;

    const panelCost = solarArray.panelCount * solarArray.panelWattage * costs.PANEL_PER_WATT;
    const batteryCost = batteryBank.batteryCount * costs.BATTERY_PER_UNIT;
    const inverterCost = powerElectronics.recommendedInverter * costs.INVERTER_PER_WATT;
    const controllerCost = powerElectronics.recommendedController * costs.CONTROLLER_PER_AMP;
    const mountingCost = solarArray.panelCount * costs.MOUNTING_PER_PANEL;
    const laborCost = panelCost * costs.LABOR_PERCENTAGE;
    const permitsCost = costs.PERMITS_FIXED;

    const subtotal = panelCost + batteryCost + inverterCost + controllerCost + mountingCost + laborCost + permitsCost;

    // Tax estimate (varies by location, using 8% average)
    const taxRate = 0.08;
    const tax = subtotal * taxRate;

    const total = subtotal + tax;

    return {
      breakdown: {
        panels: { amount: parseFloat(panelCost.toFixed(2)), label: `Solar Panels (×${solarArray.panelCount})` },
        batteries: { amount: parseFloat(batteryCost.toFixed(2)), label: `Battery Bank (×${batteryBank.batteryCount})` },
        inverter: { amount: parseFloat(inverterCost.toFixed(2)), label: 'Inverter' },
        controller: { amount: parseFloat(controllerCost.toFixed(2)), label: 'Charge Controller' },
        mounting: { amount: parseFloat(mountingCost.toFixed(2)), label: 'Mounting & Racking' },
        labor: { amount: parseFloat(laborCost.toFixed(2)), label: 'Installation Labor' },
        permits: { amount: permitsCost, label: 'Permits & Inspections' },
        tax: { amount: parseFloat(tax.toFixed(2)), label: 'Tax (estimated 8%)' },
      },
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      perWatt: parseFloat((total / solarArray.arraySizeW).toFixed(2)),
    };
  }

  /**
   * I. FINANCIAL PROJECTION
   */
  static calculateFinancials(totalCost, config) {
    const financial = SOLAR_CONSTANTS.FINANCIAL;

    // Monthly savings
    const monthlySavings = financial.AVG_MONTHLY_BILL * financial.SAVINGS_PERCENTAGE;
    const yearlySavings = monthlySavings * 12;

    // Simple payback (before incentives)
    const paybackYears = totalCost / yearlySavings;

    // 25-year projection with degradation and inflation
    let cumulativeSavings = 0;
    const yearlyData = [];

    for (let year = 1; year <= 25; year++) {
      const degradationFactor = Math.pow(1 - financial.PANEL_DEGRADATION, year - 1);
      const inflationFactor = Math.pow(1 + financial.ELECTRICITY_INFLATION, year - 1);
      const yearSavings = yearlySavings * degradationFactor * inflationFactor;
      cumulativeSavings += yearSavings;

      yearlyData.push({
        year,
        savings: parseFloat(yearSavings.toFixed(2)),
        cumulativeSavings: parseFloat(cumulativeSavings.toFixed(2)),
        efficiency: parseFloat((degradationFactor * 100).toFixed(1)),
      });
    }

    // Net present value (simplified, 5% discount rate)
    const discountRate = 0.05;
    const npv = yearlyData.reduce((sum, y) => {
      return sum + (y.savings / Math.pow(1 + discountRate, y.year));
    }, -totalCost);

    // Federal tax credit (30% ITC)
    const federalTaxCredit = totalCost * 0.30;
    const netCost = totalCost - federalTaxCredit;
    const netPayback = netCost / yearlySavings;

    return {
      assumptions: {
        avgMonthlyBill: financial.AVG_MONTHLY_BILL,
        savingsPercentage: financial.SAVINGS_PERCENTAGE * 100,
        panelDegradation: financial.PANEL_DEGRADATION * 100,
        electricityInflation: financial.ELECTRICITY_INFLATION * 100,
        discountRate: discountRate * 100,
      },
      monthlySavings: parseFloat(monthlySavings.toFixed(2)),
      yearlySavings: parseFloat(yearlySavings.toFixed(2)),
      paybackYears: parseFloat(paybackYears.toFixed(1)),
      netPaybackYears: parseFloat(netPayback.toFixed(1)),
      federalTaxCredit: parseFloat(federalTaxCredit.toFixed(2)),
      netCost: parseFloat(netCost.toFixed(2)),
      twentyFiveYearSavings: parseFloat(cumulativeSavings.toFixed(2)),
      netPresentValue: parseFloat(npv.toFixed(2)),
      roi: parseFloat(((cumulativeSavings - totalCost) / totalCost * 100).toFixed(1)),
      yearlyProjection: yearlyData,
    };
  }

  /**
   * AI Optimization
   * Suggests improvements based on goals and constraints
   */
  static optimize(params, goals = ['maximize_efficiency']) {
    const baseCalculation = this.calculate(params);
    const recommendations = [];

    // Check if battery can be optimized
    if (goals.includes('extend_autonomy')) {
      const currentAutonomy = baseCalculation.data.batteryBank.autonomyDays;
      if (currentAutonomy < 2) {
        recommendations.push({
          type: 'battery_upgrade',
          priority: 'high',
          current: `${baseCalculation.data.batteryBank.capacityAh}Ah`,
          recommended: `${Math.ceil(baseCalculation.data.batteryBank.capacityAh * 1.5)}Ah`,
          impact: `+${(baseCalculation.data.batteryBank.autonomyDays * 0.5).toFixed(1)} days autonomy`,
          costDelta: baseCalculation.data.batteryBank.batteryCount * 600,
          reason: 'Low autonomy for off-grid reliability',
        });
      }
    }

    // Check panel efficiency
    if (goals.includes('maximize_efficiency')) {
      const tempLoss = baseCalculation.data.lossAnalysis.components.temperature.percent;
      if (tempLoss > 15) {
        recommendations.push({
          type: 'panel_upgrade',
          priority: 'medium',
          current: `${params.config?.panelWattage || 550}W standard`,
          recommended: 'Bifacial or HJT panels with lower temp coefficient',
          impact: '-3-5% temperature loss',
          costDelta: baseCalculation.data.solarArray.panelCount * 80,
          reason: 'High ambient temperature causing significant losses',
        });
      }
    }

    // Cost optimization
    if (goals.includes('minimize_cost')) {
      const perWattCost = baseCalculation.data.costEstimate.perWatt;
      if (perWattCost > 3.5) {
        recommendations.push({
          type: 'cost_reduction',
          priority: 'medium',
          suggestion: 'Consider DIY installation or local installer quotes',
          potentialSavings: baseCalculation.data.costEstimate.breakdown.labor.amount * 0.3,
          reason: 'Labor costs are above market average',
        });
      }
    }

    return {
      ...baseCalculation,
      data: {
        ...baseCalculation.data,
        optimization: {
          goals,
          recommendations,
          summary: `${recommendations.length} optimization opportunities found`,
        },
      },
    };
  }
}

module.exports = SolarEngine;
