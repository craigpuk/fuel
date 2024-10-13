// worker.js

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
  const R = 8.314; // Universal gas constant J/(mol·K)
  const pressurePa = pressureBar * 1e5; // Convert bar to Pascals
  const temperatureK = temperatureC + 273.15; // Convert Celsius to Kelvin
  const inletAirTempK = inletAirTemperatureC + 273.15;

  // Initialize variables for total properties
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

  // Use Ideal Gas Law to calculate the fuel gas density:
  const gasDensity = (pressurePa * totalMolarMass) / (R * temperatureK);

  // Molar flow rate (mol/s)
  let nFuel = 0;
  if (mixture.some(fuel => fuel.fuel.Type === 'Solid' || fuel.fuel.Type === 'Liquid')) {
    // If solid or liquid, use mass flow rate (kg/h)
    nFuel = fuelFlowRate / (totalMolarMass / 1000);
  } else {
    // Otherwise, use volumetric flow rate (m³/h)
    nFuel = (fuelFlowRate * gasDensity) / (totalMolarMass / 1000);
  }
  const nFuelPerSecond = nFuel / 3600;

  let stoichO2 = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    stoichO2 += (fuel.C + fuel.H / 4) * (percentage / 100);
  });

  // Total O₂ required for stoichiometric combustion and considering excess air
  const totalO2Required = stoichO2 * (1 + excessAirPercentage / 100);

  const nAirO2 = totalO2Required * nFuel;
  const nAirN2 = nAirO2 * (79 / 21);
  const nAir = nAirO2 + nAirN2;
  const nAirPerSecond = nAir / 3600;

  const airFlowRate = (nAirPerSecond * R * temperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRate * 3600;

  // Max stoichiometric CO₂
  let stoichCO2 = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    const percentage = component.percentage;
    stoichCO2 += fuel.C * (percentage / 100);
  });

  // Wet and Dry Gas Volume Percentages
  const nH2O = (stoichCO2 * 2) * nFuel; // Assuming complete combustion of hydrocarbons
  const totalMolesWet = nFuel + nAir + nH2O;
  const totalMolesDry = totalMolesWet - nH2O; // Dry removes H2O

  const wetBasis = {
    CO2: (stoichCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    O2: (nAirO2 / totalMolesWet) * 100,
    N2: (nAirN2 / totalMolesWet) * 100
  };

  const dryBasis = {
    CO2: (stoichCO2 / totalMolesDry) * 100,
    O2: (nAirO2 / totalMolesDry) * 100,
    N2: (nAirN2 / totalMolesDry) * 100
  };

  // Flame temperature calculation using energy balance
  const Cp_products = 37; // Average specific heat capacity for products in J/(mol·K)
  const heatReleased = nFuelPerSecond * totalLHV * 1e6; // Convert MJ/kg to J/mol
  const deltaT = heatReleased / (totalMolesWet * Cp_products);
  const flameTemperatureK = temperatureK + deltaT;

  // NOx calculation
  const A = 1e-5;
  const B = 0.0006;
  const C = 0.5;
  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow((wetBasis.O2 + 1), C) * 1e6;

  // Updated cost saving and efficiency calculations across 10 combustion points
  let totalEfficiency = 0;
  let totalCostSavings = 0;
  let costAnalysis = '';

  if (combustionPoints.length !== 10) {
    throw new Error('Exactly 10 combustion points must be provided.');
  }

  combustionPoints.forEach((point, index) => {
    const { flowRate, o2, co2 } = point;

    let nFuelPoint = flowRate / (totalMolarMass / 1000);
    const stoichO2Point = stoichO2 * nFuelPoint;

    const combustionEfficiency = (co2 / stoichCO2) * 100; // CO₂-based efficiency
    totalEfficiency += combustionEfficiency;

    let costAtPoint = 0;
    if (isCostCalculationEnabled) {
      costAtPoint = (flowRate / combustionEfficiency) * fuelCost;
      totalCostSavings += costAtPoint;
      costAnalysis += `Point ${index + 1}:\n` +
                     `  Flow Rate: ${flowRate.toFixed(2)} m³/h\n` +
                     `  O₂ Reading: ${o2.toFixed(2)}%\n` +
                     `  CO₂ Reading: ${co2.toFixed(2)}%\n` +
                     `  Combustion Efficiency: ${combustionEfficiency.toFixed(2)}%\n` +
                     `  Cost at Point: $${costAtPoint.toFixed(2)}\n\n`;
    }
  });

  const averageEfficiency = totalEfficiency / combustionPoints.length;

  if (isCostCalculationEnabled) {
    const operationalHours = 40; // Assume 40 hours of operation per week
    const weeklyCostSavings = totalCostSavings * operationalHours;
    costAnalysis += `Total Weekly Cost Savings: $${weeklyCostSavings.toFixed(2)}`;
  }

  const results = {
    totalMolarMass: parseFloat(totalMolarMass.toFixed(2)),
    totalLHV: parseFloat(totalLHV.toFixed(2)),
    totalHHV: parseFloat(totalHHV.toFixed(2)),
    nFuel: parseFloat(nFuelPerSecond.toFixed(4)),
    nAir: parseFloat(nAirPerSecond.toFixed(4)),
    airFlowRate: parseFloat(airFlowRateM3h.toFixed(2)),
    flowRateUnit: 'm³/h',
    combustionEfficiency: parseFloat(averageEfficiency.toFixed(2)),
    fuelGasDensity: parseFloat(gasDensity.toFixed(4)),
    flameTemperatureK: parseFloat(flameTemperatureK.toFixed(2)),
    NOx_ppm: parseFloat(NOx_ppm.toFixed(2)),
    wetBasis,
    dryBasis,
    combustionPoints: combustionPoints.map(point => ({
      flowRate: point.flowRate,
      o2: point.o2,
      co2: point.co2,
      efficiency: parseFloat(((point.co2 / stoichCO2) * 100).toFixed(2)),
      cost: isCostCalculationEnabled ? parseFloat(((point.flowRate / ((point.co2 / stoichCO2) * 100)) * fuelCost).toFixed(2)) : 'N/A'
    })),
    costAnalysis: isCostCalculationEnabled ? costAnalysis : 'Fuel cost calculations are disabled.'
  };

  return results;
}
