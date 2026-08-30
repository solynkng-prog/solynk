const SolarEngine = require('../../src/modules/calculator/solar-engine');

describe('SolarEngine', () => {
  const sampleAppliances = [
    { name: 'Refrigerator', quantity: 1, watts: 150, hoursPerDay: 24 },
    { name: 'LED TV', quantity: 2, watts: 100, hoursPerDay: 5 },
    { name: 'Air Conditioner', quantity: 1, watts: 1200, hoursPerDay: 8 },
  ];

  const sampleConfig = {
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
  };

  test('calculates load analysis correctly', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.success).toBe(true);
    expect(result.data.loadAnalysis.totalWh).toBeGreaterThan(0);
    expect(result.data.loadAnalysis.peakLoad).toBe(1550); // 150 + 200 + 1200
  });

  test('calculates battery bank correctly', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.data.batteryBank.capacityAh).toBeGreaterThan(0);
    expect(result.data.batteryBank.batteryVoltage).toBe(48);
    expect(result.data.batteryBank.depthOfDischarge).toBe(90);
  });

  test('calculates solar array correctly', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.data.solarArray.panelCount).toBeGreaterThan(0);
    expect(result.data.solarArray.arraySizeW).toBeGreaterThan(0);
    expect(result.data.solarArray.dailyGenerationWh).toBeGreaterThan(0);
  });

  test('calculates power electronics correctly', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.data.powerElectronics.inverterSize).toBeGreaterThan(0);
    expect(result.data.powerElectronics.controllerSize).toBeGreaterThan(0);
    expect(result.data.powerElectronics.safetyMargin).toBe('25%');
  });

  test('calculates costs correctly', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.data.costEstimate.total).toBeGreaterThan(0);
    expect(result.data.costEstimate.breakdown).toBeDefined();
  });

  test('calculates financial projection', () => {
    const result = SolarEngine.calculate({ appliances: sampleAppliances, config: sampleConfig });

    expect(result.data.financialProjection.paybackYears).toBeGreaterThan(0);
    expect(result.data.financialProjection.roi).toBeGreaterThan(0);
    expect(result.data.financialProjection.yearlyProjection).toHaveLength(25);
  });

  test('optimization returns recommendations', () => {
    const result = SolarEngine.optimize(
      { appliances: sampleAppliances, config: sampleConfig },
      ['maximize_efficiency', 'extend_autonomy']
    );

    expect(result.data.optimization).toBeDefined();
    expect(Array.isArray(result.data.optimization.recommendations)).toBe(true);
  });

  test('handles empty appliances gracefully', () => {
    const result = SolarEngine.calculate({ appliances: [], config: sampleConfig });

    expect(result.data.loadAnalysis.totalWh).toBe(0);
    expect(result.data.loadAnalysis.peakLoad).toBe(0);
  });
});
