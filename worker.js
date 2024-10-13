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
    maxFlowRate,
    combustionPoints
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
      maxFlowRate,
      combustionPoints
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
 * @param {Array} combustionPoints - Array of combustion point objects with flowRate, o2, and co2.
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
  maxFlowRate,
  combustionPoints
) {
  // Constants
  const R = 8.314; // Universal gas constant J/(mol·K)
  const pressurePa = pressureBar * 1e5; // Convert bar to Pascals
  const temperatureK = temperatureC + 273.15; // Convert Celsius to Kelvin

  // Determine flow rate unit based on fuel types
  let flowRateUnit = 'm³/h';
  const containsSolidOrLiquid = mixture.some(fuelObj => fuelObj.fuel.Type === 'Solid' || fuelObj.fuel.Type === 'Liquid');
  if (containsSolidOrLiquid) {
    flowRateUnit = 'kg/h';
  }

  // Calculate average properties of the fuel mixture
  let totalMolarMass = 0; // g/mol
  let totalLHV = 0; // MJ/kg
  let totalHHV = 0; // MJ/kg

  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    totalMolarMass += fuel.MolarMass * (percentage / 100);
    totalLHV += fuel.HeatingValue * (percentage / 100);
    totalHHV += fuel.HHV * (percentage / 100);
  });

  // Calculate molar flow rate of fuel
  // If volumetric, assume a density or convert as necessary (simplified here)
  // For mass flow rate, convert to molar flow rate
  let nFuel = 0; // mol/h
  if (flowRateUnit === 'm³/h') {
    // Placeholder: Assume density of fuel is 1 kg/m³ for gases (simplification)
    const density = 1; // kg/m³ (This should be adjusted based on actual fuel density)
    const massFlowRate = fuelFlowRate * density; // kg/h
    nFuel = massFlowRate / (totalMolarMass / 1000); // mol/h
  } else {
    // kg/h to mol/h
    nFuel = fuelFlowRate / (totalMolarMass / 1000); // mol/h
  }
  const nFuelPerSecond = nFuel / 3600; // mol/s

  // Calculate stoichiometric O2 required
  // Assuming complete combustion: C + O2 -> CO2, H2 + 0.5O2 -> H2O
  let stoichO2 = 0; // mol O2 per mol fuel
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    const fuelFraction = percentage / 100;
    stoichO2 += (fuel.C + fuel.H / 4) * fuelFraction;
  });

  // Total O2 required with excess air
  const totalO2Required = stoichO2 * (1 + excessAirPercentage / 100); // mol O2 per mol fuel

  // Molar flow rate of air (assuming air is 21% O2 and 79% N2)
  const nAirO2 = totalO2Required * nFuel; // mol/h
  const nAirN2 = nAirO2 * (79 / 21); // mol/h
  const nAir = nAirO2 + nAirN2; // mol/h
  const nAirPerSecond = nAir / 3600; // mol/s

  // Calculate flow rate of air (m³/h) using ideal gas law
  const airFlowRate = (nAirPerSecond * R * temperatureK) / pressurePa; // m³/s
  const airFlowRateM3h = airFlowRate * 3600; // m³/h

  // Calculate stoichiometric CO2 production
  let stoichCO2 = 0; // mol CO2 per mol fuel
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    const fuelFraction = percentage / 100;
    stoichCO2 += fuel.C * fuelFraction; // mol CO2 per mol fuel
  });

  // Process combustion points
  let totalEfficiency = 0;
  let totalCostSavings = 0;
  let costAnalysis = '';

  combustionPoints.forEach((point, index) => {
    const { flowRate, o2, co2 } = point;

    // Calculate molar flow rate of fuel at this point
    let nFuelPoint = 0; // mol/h
    if (flowRateUnit === 'm³/h') {
      const density = 1; // kg/m³ (Adjust as needed)
      const massFlowRate = flowRate * density; // kg/h
      nFuelPoint = massFlowRate / (totalMolarMass / 1000); // mol/h
    } else {
      nFuelPoint = flowRate / (totalMolarMass / 1000); // mol/h
    }
    const nFuelPointPerSecond = nFuelPoint / 3600; // mol/s

    // Stoichiometric CO2 for this flow rate
    const stoichCO2Point = stoichCO2 * nFuelPoint; // mol CO2

    // Combustion Efficiency
    const efficiency = (co2 / stoichCO2Point) * 100; // %

    totalEfficiency += efficiency;

    // Cost Calculations
    let costAtPoint = 0;
    if (isCostCalculationEnabled) {
      // Cost is proportional to flow rate and inversely proportional to efficiency
      // Simplified calculation: (flowRate / efficiency) * fuelCost
      costAtPoint = (flowRate / efficiency) * fuelCost;
      totalCostSavings += costAtPoint; // Assuming operating hours are accounted for elsewhere
      costAnalysis += `Point ${index + 1}:\n` +
                     `  Flow Rate: ${flowRate.toFixed(2)} ${flowRateUnit}\n` +
                     `  O₂ Reading: ${o2.toFixed(2)}%\n` +
                     `  CO₂ Reading: ${co2.toFixed(2)}%\n` +
                     `  Combustion Efficiency: ${efficiency.toFixed(2)}%\n` +
                     `  Cost at Point: $${costAtPoint.toFixed(2)}\n\n`;
    }
  });

  // Average Combustion Efficiency
  const averageEfficiency = combustionPoints.length > 0 ? (totalEfficiency / combustionPoints.length) : 0;

  // Aggregate Cost Analysis
  if (isCostCalculationEnabled) {
    // Assuming operational hours, e.g., 40 hours/week
    const operationalHours = 40;
    const weeklyCostSavings = totalCostSavings * operationalHours;
    costAnalysis += `Total Weekly Cost Savings: $${weeklyCostSavings.toFixed(2)}`;
  }

  // Prepare emission calculations (simplified placeholders)
  // In real scenarios, emissions should be calculated based on fuel composition and combustion efficiency
  const nCO2 = stoichCO2 * (fuelFlowRate / fuelFlowRate) / 3600; // mol/s (normalized)
  const nH2O = (stoichCO2 * 2) * (fuelFlowRate / fuelFlowRate) / 3600; // mol/s
  const nSO2 = 0; // Placeholder
  const nCO = 0; // Placeholder
  const nUnburnedH2 = 0; // Placeholder
  const nO2Excess = (nAirPerSecond * 0.21) - (stoichO2 / 3600); // mol/s
  const nN2 = (nAirPerSecond * 0.79).toFixed(4); // mol/s
  const nNOx = 0; // Placeholder
  const nAsh = 0; // Placeholder
  const SOx_ppm = 0; // Placeholder
  const NOx_ppm = 0; // Placeholder
  const NOx_normalized = 0; // Placeholder
  const NOx_flue_gas_temp = 0; // Placeholder
  const NOx_corrected_O2_normalized = 0; // Placeholder
  const NOx_corrected_O2_actual = 0; // Placeholder

  // Prepare final results object
  const results = {
    totalMolarMass: parseFloat(totalMolarMass.toFixed(2)), // g/mol
    totalLHV: parseFloat(totalLHV.toFixed(2)), // MJ/kg
    totalHHV: parseFloat(totalHHV.toFixed(2)), // MJ/kg
    nFuel: parseFloat(nFuelPerSecond.toFixed(4)), // mol/s
    nAir: parseFloat(nAirPerSecond.toFixed(4)), // mol/s
    airFlowRate: parseFloat(airFlowRateM3h.toFixed(2)), // m³/h
    flowRateUnit: flowRateUnit,
    combustionEfficiency: parseFloat(averageEfficiency.toFixed(2)), // %
    flameTemperatureC: flueGasTemperatureC, // °C
    fuelGasDensity: parseFloat((fuelFlowRate / airFlowRateM3h).toFixed(4)), // kg/m³ (simplified)
    // Emissions (placeholders)
    nCO2: parseFloat(nCO2.toFixed(4)), // mol/s
    nH2O: parseFloat(nH2O.toFixed(4)), // mol/s
    nSO2: nSO2,
    nCO: nCO,
    nUnburnedH2: nUnburnedH2,
    nO2Excess: parseFloat(nO2Excess.toFixed(4)), // mol/s
    nN2: parseFloat(nN2), // mol/s
    nNOx: nNOx,
    nAsh: nAsh,
    SOx_ppm: SOx_ppm,
    NOx_ppm: NOx_ppm,
    NOx_normalized: NOx_normalized,
    NOx_flue_gas_temp: NOx_flue_gas_temp,
    NOx_corrected_O2_normalized: NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual: NOx_corrected_O2_actual,
    combustionPoints: combustionPoints.map(point => ({
      flowRate: point.flowRate,
      o2: point.o2,
      co2: point.co2,
      efficiency: ((point.co2 / (stoichCO2 * (point.flowRate / fuelFlowRate))) * 100).toFixed(2),
      cost: isCostCalculationEnabled ? ((point.flowRate / ((point.co2 / (stoichCO2 * (point.flowRate / fuelFlowRate))) * 100)) * fuelCost).toFixed(2) : 'N/A'
    })),
    costAnalysis: isCostCalculationEnabled ? costAnalysis : 'Fuel cost calculations are disabled.'
  };

  return results;
}
