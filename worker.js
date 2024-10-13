// worker.js

// Listen for messages from the main thread
onmessage = function(e) {
  const {
    mixture,
    temperatureC,
    pressureBar,
    fuelFlowRate,
    isMassFlowRate,
    excessAirPercentage,
    flueGasTemperatureC,
    inletAirTemperatureC,
    referenceO2,
    relativeHumidity
  } = e.data;

  try {
    const results = performCalculations(
      mixture,
      temperatureC,
      pressureBar,
      fuelFlowRate,
      isMassFlowRate,
      excessAirPercentage,
      flueGasTemperatureC,
      inletAirTemperatureC,
      referenceO2,
      relativeHumidity
    );

    postMessage(results);
  } catch (error) {
    postMessage({ error: error.message });
  }
};

// Calculation logic
function performCalculations(
  mixture,
  temperatureC,
  pressureBar,
  fuelFlowRateInput,
  isMassFlowRate,
  excessAirPercentage,
  flueGasTemperatureC,
  inletAirTemperatureC,
  referenceO2,
  relativeHumidity
) {
  // Constants
  const R = 8.314; // J/(mol·K)
  const O2FractionInAir = 0.21; // Oxygen fraction in dry air
  const N2FractionInAir = 0.79; // Nitrogen fraction in dry air

  // Adjust air composition based on relative humidity
  const inletAirMoistureFraction = relativeHumidity / 100; // Convert percentage to fraction
  const adjustedO2FractionInAir = O2FractionInAir * (1 - inletAirMoistureFraction);
  const adjustedN2FractionInAir = N2FractionInAir * (1 - inletAirMoistureFraction);
  const H2OFractionInAir = inletAirMoistureFraction;

  // Calculate average molar mass of fuel mixture
  let totalMolarMass = 0;
  mixture.forEach(component => {
    totalMolarMass += (component.percentage / 100) * component.fuel.MolarMass;
  });

  // Calculate average LHV and HHV
  let totalLHV = 0;
  let totalHHV = 0;
  mixture.forEach(component => {
    totalLHV += (component.percentage / 100) * component.fuel.HeatingValue;
    totalHHV += (component.percentage / 100) * (component.fuel.HHV || 0);
  });

  // Calculate stoichiometric O2 required
  let O2RequiredPerMolFuel = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    // Stoichiometric O2 = C + (H/4) + (S/2) - (O/2)
    O2RequiredPerMolFuel += (component.percentage / 100) * (fuel.C + (fuel.H / 4) + (fuel.S / 2) - (fuel.O / 2));
  });

  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  // Air required per mole of fuel (stoichiometric)
  const airRequiredPerMolFuel = O2RequiredPerMolFuel / adjustedO2FractionInAir;

  // Total molar flow rate of fuel (mol/s)
  let nFuel;
  if (isMassFlowRate) {
    // Convert mass flow rate from kg/h to kg/s
    const fuelFlowRateKgs = fuelFlowRateInput / 3600;
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // mol/s
  } else {
    // Volumetric flow rate (m³/h) to mol/s using ideal gas law
    const fuelFlowRateM3s = fuelFlowRateInput / 3600;
    const temperatureK = temperatureC + 273.15;
    const pressurePa = pressureBar * 1e5;
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK); // mol/s
  }

  // Molar flow rate of air required (mol/s) with excess air
  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirPercentage / 100);

  // Calculate combustion products
  let nCO2 = 0;
  let nH2O = 0;
  let nSO2 = 0;
  let nCO = 0;
  let nUnburnedH2 = 0;
  let nO2Excess = 0;
  let nN2 = 0;
  let nNOx = 0;
  let nAsh = 0;

  mixture.forEach(component => {
    const fuel = component.fuel;
    const fuelMolarFraction = component.percentage / 100;
    const nFuelComponent = nFuel * fuelMolarFraction;

    // Calculate moles of each product
    nCO2 += fuel.C * nFuelComponent;
    nH2O += (fuel.H / 2) * nFuelComponent;
    nSO2 += fuel.S * nFuelComponent;
    nNOx += fuel.N * nFuelComponent; // Simplified assumption
    nAsh += (fuel.AshContent || 0) / 100 * nFuelComponent;
  });

  // Molar flow rate of O2 consumed
  const nO2Consumed = nFuel * O2RequiredPerMolFuel;

  // Molar flow rate of O2 supplied
  const nO2Supplied = nAir * adjustedO2FractionInAir;

  // Excess O2
  nO2Excess = nO2Supplied - nO2Consumed;

  if (nO2Excess < 0) {
    // Incomplete combustion, adjust for unburned fuel (simplistic approach)
    nO2Excess = 0;
    nCO += Math.abs(nO2Excess);
  }

  // Nitrogen from air
  nN2 = nAir * adjustedN2FractionInAir;

  // Combustion Efficiency based on CO2%
  // Stoichiometric moles of CO2
  let stoichCO2 = 0;
  mixture.forEach(component => {
    const fuel = component.fuel;
    stoichCO2 += fuel.C * (component.percentage / 100) * nFuel;
  });

  // Actual moles of CO2
  const actualCO2 = nCO2;

  // Combustion Efficiency
  const combustionEfficiency = (actualCO2 / stoichCO2) * 100;

  // Heat Balance (Simplistic)
  // Assume all LHV is released and absorbed by flue gas
  const heatReleased = nFuel * totalLHV * 1e6; // J/s
  const CpFlueGas = 37; // J/(mol·K), approximate average
  const totalMolesFlueGas = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nAsh;
  const flameTemperatureK = (heatReleased / (totalMolesFlueGas * CpFlueGas)) + (temperatureC + 273.15);

  // Fuel Gas Density (assuming ideal gas at inlet conditions)
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;
  const fuelGasDensity = (nFuel * totalMolarMass) / (R * temperatureK / pressurePa); // kg/m³

  // Volume Percentages (Wet Basis)
  const totalMolesWet = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nAsh;
  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    SO2: (nSO2 / totalMolesWet) * 100,
    CO: (nCO / totalMolesWet) * 100,
    H2: (nUnburnedH2 / totalMolesWet) * 100,
    O2: (nO2Excess / totalMolesWet) * 100,
    N2: (nN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: (nAsh / totalMolesWet) * 100
  };

  // Volume Percentages (Dry Basis)
  const totalMolesDry = totalMolesWet - nH2O;
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    CO: (nCO / totalMolesDry) * 100,
    H2: (nUnburnedH2 / totalMolesDry) * 100,
    O2: (nO2Excess / totalMolesDry) * 100,
    N2: (nN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100,
    Ash: (nAsh / totalMolesDry) * 100
  };

  // NOx Emissions (Simplistic Estimation)
  const NOx_ppm = (nNOx / totalMolesWet) * 1e6; // ppm

  // Advanced NOx Calculations (Placeholders, needs proper formulas)
  const NOx_normalized = NOx_ppm * 2.0536; // Example conversion factor
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - volumePercentagesDry.O2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - volumePercentagesDry.O2));

  // CO Calculations
  // Only calculate CO ppm if combustion efficiency < 100%
  let CO_ppm = 0;
  if (combustionEfficiency < 100) {
    CO_ppm = (nCO / totalMolesWet) * 1e6; // ppm
  }

  // Prepare results object
  return {
    totalMolarMass,
    totalLHV,
    totalHHV,
    nFuel,
    nAir,
    airFlowRate: isMassFlowRate ? (nAir * 28.97e-3 * 3600).toFixed(2) : (nAir * R * (inletAirTemperatureC + 273.15) / (pressureBar * 1e5) * 3600).toFixed(2),
    flowRateUnit: isMassFlowRate ? 'kg/h' : 'm³/h',
    combustionEfficiency,
    flameTemperatureK,
    fuelGasDensity,
    combustionResults: {
      nCO2,
      nH2O,
      nSO2,
      nCO,
      nUnburnedH2,
      nO2Excess,
      nN2,
      nNOx,
      nAsh,
      totalMolesProducts: totalMolesWet
    },
    SOx_ppm: (nSO2 / totalMolesWet) * 1e6, // ppm
    volumePercentagesWet,
    volumePercentagesDry,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    CO_ppm,
    fuelGasDensity,
    stoichCO2_percent: (stoichCO2 / totalMolesDry) * 100
  };
}

// Helper function to estimate NOx emissions (Simplistic)
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Placeholder for actual NOx estimation formula
  // Replace with a valid empirical or kinetic model as needed
  const A = 1e-5;
  const B = 0.0006;
  const C = 0.5;
  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(excessAirFraction * 100 + 1, C) * 1e6;
  return NOx_ppm;
}