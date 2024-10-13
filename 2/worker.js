// worker.js

// Listen for messages from the main thread
onmessage = function(e) {
  const {
    mixture,
    temperatureC,
    inletAirTemperatureC,
    pressureBar,
    fuelFlowRate,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2,
    isCostCalculationEnabled,
    fuelCost,
    minFlowRate,
    maxFlowRate
  } = e.data;

  try {
    const results = performCalculations(
      mixture,
      temperatureC,
      inletAirTemperatureC,
      pressureBar,
      fuelFlowRate,
      excessAirPercentage,
      flueGasTemperatureC,
      referenceO2,
      isCostCalculationEnabled,
      fuelCost,
      minFlowRate,
      maxFlowRate
    );

    postMessage(results);
  } catch (error) {
    postMessage({ error: error.message });
  }
};

/**
 * Performs combustion and cost calculations.
 * @param {Array} mixture - Array of fuel objects with their percentages.
 * @param {number} temperatureC - Ambient temperature in Celsius.
 * @param {number} inletAirTemperatureC - Inlet air temperature in Celsius.
 * @param {number} pressureBar - Atmospheric pressure in bar.
 * @param {number} fuelFlowRate - Fuel flow rate (m³/h or kg/h).
 * @param {number} excessAirPercentage - Excess air percentage.
 * @param {number} flueGasTemperatureC - Flue gas temperature in Celsius.
 * @param {number} referenceO2 - Reference O₂ percentage.
 * @param {boolean} isCostCalculationEnabled - Flag to enable cost calculations.
 * @param {number} fuelCost - Cost per m³/h or kg/h.
 * @param {number} minFlowRate - Minimum flow rate for O₂ vs CO₂ readings.
 * @param {number} maxFlowRate - Maximum flow rate for O₂ vs CO₂ readings.
 * @returns {Object} - Calculation results.
 */
function performCalculations(
  mixture,
  temperatureC,
  inletAirTemperatureC,
  pressureBar,
  fuelFlowRate,
  excessAirPercentage,
  flueGasTemperatureC,
  referenceO2,
  isCostCalculationEnabled,
  fuelCost,
  minFlowRate,
  maxFlowRate
) {
  // Constants
  const R = 8.314; // Universal gas constant J/(mol·K)
  const molarVolume = 22.414; // molar volume at STP in L/mol
  const pressurePa = pressureBar * 1e5; // Convert bar to Pascals
  const temperatureK = temperatureC + 273.15; // Convert Celsius to Kelvin
  const inletAirTempK = inletAirTemperatureC + 273.15;

  // Calculate average properties of the fuel mixture
  let totalMolarMass = 0;
  let totalLHV = 0;
  let totalHHV = 0;

  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    totalMolarMass += fuel.MolarMass * (percentage / 100);
    totalLHV += fuel.HeatingValue * (percentage / 100);
    totalHHV += fuel.HHV * (percentage / 100);
  });

  // Determine if flow rate is mass or volumetric based on fuel type
  let flowRateUnit = 'm³/h';
  const containsSolidOrLiquid = mixture.some(fuel => fuel.fuel.Type === 'Solid' || fuel.fuel.Type === 'Liquid');
  if (containsSolidOrLiquid) {
    flowRateUnit = 'kg/h';
  }

  // Calculate molar flow rate of fuel
  // For volumetric flow rate (m³/h), convert to kg/h using density if needed
  // Here, assuming fuelFlowRate is directly usable for calculation
  // This may need adjustment based on actual density data
  const nFuel = fuelFlowRate / (totalMolarMass / 1000); // mol/h
  const nFuelPerSecond = nFuel / 3600; // mol/s

  // Calculate stoichiometric air required
  // Assuming complete combustion: C + O2 -> CO2, H2 + 0.5O2 -> H2O
  let stoichO2 = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    const fuelFraction = percentage / 100;
    stoichO2 += (fuel.C + fuel.H / 4) * fuelFraction;
  });

  // Total O2 required with excess air
  const totalO2Required = stoichO2 * (1 + excessAirPercentage / 100);

  // Molar flow rate of air (assuming air is 21% O2 and 79% N2)
  const nAirO2 = totalO2Required; // mol/h
  const nAirN2 = nAirO2 * (79 / 21); // mol/h
  const nAir = nAirO2 + nAirN2; // mol/h
  const nAirPerSecond = nAir / 3600; // mol/s

  // Calculate flow rate of air (m³/h)
  const airFlowRate = (nAirPerSecond * R * temperatureK) / pressurePa; // m³/s
  const airFlowRateM3h = airFlowRate * 3600; // m³/h

  // Calculate combustion efficiency based on O2 vs CO2 readings
  // Placeholder: Assuming user provides stoichiometric CO2 and actual CO2
  // For demonstration, let's calculate efficiency as:
  // Efficiency = (Measured CO2 / Stoichiometric CO2) * 100
  // Here, we need actual CO2 readings, which should be provided as part of the data
  // Since O2 vs CO2 readings are to be entered by the user at multiple points,
  // we'd need to process them accordingly.

  // For this example, let's assume stoichiometric CO2 is calculated based on fuel composition
  let stoichCO2 = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    const fuelFraction = percentage / 100;
    stoichCO2 += fuel.C * fuelFraction; // mol CO2 per mol fuel
  });

  // Generate 10 points between min and max flow rates
  const points = 10;
  const step = (maxFlowRate - minFlowRate) / (points - 1);
  const combustionPoints = [];

  for (let i = 0; i < points; i++) {
    const currentFlowRate = minFlowRate + step * i;
    let excessAir = 0;
    let measuredO2 = 0;
    let measuredCO2 = 0;

    // Assign excess air based on the description:
    // - First point: ~70% excess air (~8% O2)
    // - Second point: ~4% excess air
    // - Remaining points: ~2% excess air
    if (i === 0) {
      excessAir = 70;
      measuredO2 = 8;
    } else if (i === 1) {
      excessAir = 40;
      measuredO2 = 4;
    } else {
      excessAir = 20;
      measuredO2 = 2;
    }

    // Calculate stoichiometric CO2 for current fuel flow rate
    const stoichCO2Current = stoichCO2 * (currentFlowRate / fuelFlowRate); // mol/h

    // Assume measured CO2 is stoichiometric CO2 adjusted by combustion efficiency
    // Here, combustion efficiency = (measured CO2 / stoichCO2) * 100
    // Rearranging, measured CO2 = (combustion efficiency / 100) * stoichCO2
    // For demonstration, let's assume combustion efficiency varies inversely with excess air
    const combustionEfficiency = (100 - excessAir) + (Math.random() * 5 - 2.5); // Random variation
    const measuredCO2 = (combustionEfficiency / 100) * stoichCO2Current;

    // Calculate combustion efficiency
    const efficiency = (measuredCO2 / stoichCO2Current) * 100;

    // Calculate cost based on flow rate and efficiency
    let costAtPoint = 0;
    if (isCostCalculationEnabled) {
      costAtPoint = (currentFlowRate / efficiency) * fuelCost; // Cost proportional to flow rate and inversely to efficiency
    }

    combustionPoints.push({
      flowRate: currentFlowRate,
      excessAir: excessAir,
      measuredO2: measuredO2,
      measuredCO2: measuredCO2,
      efficiency: efficiency,
      cost: costAtPoint
    });
  }

  // Calculate overall cost savings
  let totalCostSavings = 0;
  if (isCostCalculationEnabled) {
    // Assuming user provides hours of operation per week
    // For this example, let's assume 40 hours/week
    const hoursPerWeek = 40;
    combustionPoints.forEach(point => {
      totalCostSavings += point.cost * hoursPerWeek;
    });
  }

  // Prepare the results object
  const results = {
    totalMolarMass: totalMolarMass,
    totalLHV: totalLHV,
    totalHHV: totalHHV,
    nFuel: nFuelPerSecond, // mol/s
    nAir: nAirPerSecond, // mol/s
    airFlowRate: airFlowRateM3h, // m³/h
    flowRateUnit: flowRateUnit,
    combustionEfficiency: ((measuredCO2 / stoichCO2) * 100).toFixed(2), // Overall efficiency
    flameTemperatureK: flueGasTemperatureC + 273.15, // Assuming flame temp is flue gas temp
    fuelGasDensity: (fuelFlowRate / 1000) / airFlowRateM3h, // kg/m³, placeholder calculation
    nCO2: measuredCO2 / 3600, // mol/s
    nH2O: stoichCO2 / 2 / 3600, // mol/s, assuming H2O is half of CO2 stoich
    nSO2: 0, // Placeholder
    nCO: 0, // Placeholder
    nUnburnedH2: 0, // Placeholder
    nO2Excess: (nAirPerSecond * 0.21) - (stoichO2 / 3600), // Placeholder calculation
    nN2: (nAirPerSecond * 0.79), // mol/s
    nNOx: 0.001, // Placeholder
    nAsh: 0, // Placeholder
    SOx_ppm: 0, // Placeholder
    NOx_ppm: 36.68, // Example value
    NOx_normalized: 75.32, // Example value
    NOx_flue_gas_temp: 43.47, // Example value
    NOx_corrected_O2_normalized: 71.76, // Example value
    NOx_corrected_O2_actual: 41.42, // Example value
    costAnalysis: isCostCalculationEnabled ? `
      === Fuel Cost Analysis ===
      ${combustionPoints.map(point => `
        Flow Rate: ${point.flowRate.toFixed(2)} ${flowRateUnit}
        Excess Air: ${point.excessAir.toFixed(2)}%
        Measured O₂: ${point.measuredO2.toFixed(2)}%
        Measured CO₂: ${point.measuredCO2.toFixed(2)} mol/h
        Combustion Efficiency: ${point.efficiency.toFixed(2)}%
        Cost at Point: $${point.cost.toFixed(2)}
      `).join('\n')}
    
      Total Cost Savings per Week: $${totalCostSavings.toFixed(2)}
    ` : 'Fuel cost calculations are disabled.'
  };

  return results;
}
