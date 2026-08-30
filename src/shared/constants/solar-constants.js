/**
 * SOLYNK Solar Engineering Constants
 * Industry-standard values for solar system calculations
 */

const SOLAR_CONSTANTS = {
  // Standard Test Conditions (STC)
  STC_TEMPERATURE: 25,           // °C
  STC_IRRADIANCE: 1000,          // W/m²

  // Nominal Operating Cell Temperature
  NOCT_TEMP_RISE: 20,            // °C above ambient for roof-mounted

  // Battery Depth of Discharge (DoD)
  BATTERY_DOD: {
    leadacid: 0.50,
    agm: 0.60,
    gel: 0.70,
    lithium: 0.90,
  },

  // Typical Battery Capacities (Ah) per unit
  BATTERY_UNIT_CAPACITY: 200,

  // System Loss Components (industry averages)
  LOSSES: {
    WIRING: 0.02,                // 2% DC cable voltage drop
    SOILING: 0.03,               // 3% dirt/dust accumulation
    MISMATCH: 0.01,              // 1% panel mismatch & aging
    INVERTER_MIN: 0.85,          // Minimum inverter efficiency
    INVERTER_MAX: 0.99,          // Maximum inverter efficiency
  },

  // Safety Margins
  SAFETY_MARGIN: {
    INVERTER: 1.25,              // 25% above peak load
    CONTROLLER: 1.25,            // 25% above array current (NEC)
  },

  // Cost Estimates ($ per unit)
  COSTS: {
    PANEL_PER_WATT: 0.45,        // $/W for panels
    BATTERY_PER_UNIT: 1200,      // per 200Ah battery
    INVERTER_PER_WATT: 0.35,     // $/W for inverter
    CONTROLLER_PER_AMP: 15,      // $/A for charge controller
    MOUNTING_PER_PANEL: 50,      // per panel
    LABOR_PERCENTAGE: 0.25,      // 25% of panel cost
    PERMITS_FIXED: 800,          // fixed permit cost
  },

  // Financial Assumptions
  FINANCIAL: {
    AVG_MONTHLY_BILL: 150,       // $/month
    SAVINGS_PERCENTAGE: 0.85,    // 85% bill offset
    PANEL_DEGRADATION: 0.005,    // 0.5% per year
    ELECTRICITY_INFLATION: 0.03, // 3% annual increase
  },

  // Temperature Coefficient Range
  TEMP_COEFF_RANGE: {
    MIN: -0.60,                  // %/°C (worst case)
    MAX: -0.20,                  // %/°C (best case)
    DEFAULT: -0.40,              // %/°C (typical mono)
  },

  // Controller Types
  CONTROLLER: {
    MPPT_VOLTAGE_FACTOR: 1.5,  // Vmpp ≈ battery voltage × 1.5
    PWM_VOLTAGE_FACTOR: 1.0,   // Vmpp ≈ battery voltage
  },
};

module.exports = SOLAR_CONSTANTS;
