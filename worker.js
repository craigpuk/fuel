// worker.js

onmessage = function(e) {
  const {
    mixture,
    temperatureC,
    pressureBar,
    gasFlowRateM3h,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2
  } = e.data;

  try {
    const results = performCalculations(
      mixture,
      temperatureC,
      pressureBar,
      gasFlowRateM3h,
      excessAirPercentage,
      flueGasTemperatureC,
      referenceO2
    );

    postMessage(results);
  } catch (error) {
    postMessage({ error: error.message });
  }
};

// Calculation logic
function performCalculations(mixture, temperatureC, pressureBar, gasFlowRateM3h, excessAirPercentage, flueGasTemperatureC, referenceO2) {
  // Constants
  const R = 8.314; // J/(mol·K)
  const molarMassAir = 28.97; // g/mol

  // Compute overall fuel properties
  let totalMolarMass = 0;
  let totalLHV = 0;
  let totalHHV = 0;
  let totalC = 0;
  let totalH = 0;
  let totalO = 0;
  let totalN = 0;
  let totalS = 0;

  mixture.forEach(component => {
    const fuel = component.fuel;
    const molarMass = fuel.MolarMass; // g/mol
    const weightFraction = component.percentage / 100;

    totalMolarMass += weightFraction * molarMass;
    totalLHV += weightFraction * (fuel.HeatingValue || 0); // MJ/kg
    totalHHV += weightFraction * (fuel.HHV || 0); // MJ/kg

    totalC += weightFraction * (fuel.C || 0) * 12.01; // g
    totalH += weightFraction * (fuel.H || 0) * 1.008; // g
    totalO += weightFraction * (fuel.O || 0) * 16.00; // g
    totalN += weightFraction * (fuel.N || 0) * 14.01; // g
    totalS += weightFraction * (fuel.S || 0) * 32.07; // g
  });

  // Convert total elements to moles per kg of mixture
  const molesC = totalC / 12.01;
  const molesH = totalH / 1.008;
  const molesO = totalO / 16.00;
  const molesN = totalN / 14.01;
  const molesS = totalS / 32.07;

  // Moles per kg of mixture
  const molesPerKgMixture = molesC + molesH + molesO + molesN + molesS;

  // Mole fractions of elements
  const moleFractionC = molesC / molesPerKgMixture;
  const moleFractionH = molesH / molesPerKgMixture;
  const moleFractionO = molesO / molesPerKgMixture;
  const moleFractionN = molesN / molesPerKgMixture;
  const moleFractionS = molesS / molesPerKgMixture;

  // Temperature and pressure conversions
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Gas flow rate conversion
  const gasFlowRateM3s = gasFlowRateM3h / 3600;

  // Molar flow rate of fuel gas (mol/s)
  const nFuel = (pressurePa * gasFlowRateM3s) / (R * temperatureK);

  // Oxygen required for complete combustion per mole of fuel
  const O2RequiredPerMolFuel = moleFractionC + moleFractionH / 4 + moleFractionS - moleFractionO / 2;

  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  // Air required per mole of fuel (using precise O2 content in air)
  const O2FractionInAir = 0.2095; // More precise value
  const airRequiredPerMolFuel = O2RequiredPerMolFuel / O2FractionInAir;

  // Molar flow rate of air required (mol/s)
  const excessAirFraction = excessAirPercentage / 100;
  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirFraction);

  // Combustion efficiency estimation based on excess air
  const combustionEfficiency = 100 - (excessAirFraction * 2); // Simplified estimation
  const combustionEfficiencyFraction = combustionEfficiency / 100;

  // Adjust fuel combusted based on combustion efficiency
  const nFuelCombusted = nFuel * combustionEfficiencyFraction;
  const nUnburnedFuel = nFuel - nFuelCombusted;

  // Air flow rate (m³/h)
  const airFlowRateM3s = (nAir * R * temperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;

  // Total N2 from air
  const nN2Air = nAir * (1 - O2FractionInAir);

  // Moles of elements combusted
  const nC = moleFractionC * nFuelCombusted;
  const nH = moleFractionH * nFuelCombusted;
  const nS = moleFractionS * nFuelCombusted;
  const nNFuel = moleFractionN * nFuelCombusted;

  // Products from combustion
  const nCO2 = nC; // All combusted carbon forms CO2
  const nH2O = nH / 2; // H2 forms H2O
  const nSO2 = nS; // Sulfur forms SO2
  const nCO = moleFractionC * nUnburnedFuel; // Unburned carbon forms CO
  const nUnburnedH2 = (moleFractionH * nUnburnedFuel) / 2; // Unburned hydrogen

  // Oxygen consumed
  const nO2Consumed = nFuelCombusted * O2RequiredPerMolFuel;
  const nO2Supplied = nAir * O2FractionInAir;
  let nO2Excess = nO2Supplied - nO2Consumed;
  if (nO2Excess < 0) nO2Excess = 0;

  // Nitrogen in flue gas
  let nN2 = nN2Air + nNFuel;

  // Simplified NOx estimation using empirical correlation
  const heatingValuePerMol = totalLHV * totalMolarMass / 1000; // Convert MJ/kg to kJ/mol
  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuelCombusted, nAir, heatingValuePerMol);
  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = nN2 * NOx_ppm / 1e6; // Convert ppm to molar flow rate
  nN2 -= nNOx; // Adjust N2 after NOx formation

  // SOx emissions
  const totalMolesWet = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nNOx;
  const SOx_ppm = nSO2 / totalMolesWet * 1e6; // ppm

  // Volume percentages (wet basis)
  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    SO2: (nSO2 / totalMolesWet) * 100,
    CO: (nCO / totalMolesWet) * 100,
    H2: (nUnburnedH2 / totalMolesWet) * 100,
    O2: (nO2Excess / totalMolesWet) * 100,
    N2: (nN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100
  };

  // Total moles of products (dry basis)
  const totalMolesDry = totalMolesWet - nH2O;

  // Volume percentages (dry basis)
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    CO: (nCO / totalMolesDry) * 100,
    H2: (nUnburnedH2 / totalMolesDry) * 100,
    O2: (nO2Excess / totalMolesDry) * 100,
    N2: (nN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100
  };

  // Measured O2 in flue gas (for NOx correction)
  const measuredO2 = volumePercentagesDry.O2;

  // Advanced NOx Calculations
  const NOx_normalized = NOx_ppm * 2.0536;
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  // **Calculate Gas Density**
  // Molar mass of flue gas
  const molarMasses = {
    CO2: 44.01, // g/mol
    H2O: 18.015,
    SO2: 64.066,
    CO: 28.01,
    H2: 2.016,
    O2: 31.9988,
    N2: 28.0134,
    NOx: 46.0055 // Approximate molar mass for NO2
  };

  const totalMass = nCO2 * molarMasses.CO2 + nH2O * molarMasses.H2O + nSO2 * molarMasses.SO2 +
    nCO * molarMasses.CO + nUnburnedH2 * molarMasses.H2 + nO2Excess * molarMasses.O2 +
    nN2 * molarMasses.N2 + nNOx * molarMasses.NOx; // in grams per second

  const totalVolume = (totalMolesWet * R * (flueGasTemperatureC + 273.15)) / pressurePa; // m³/s

  const gasDensity = (totalMass / 1000) / totalVolume; // kg/m³

  return {
    nFuel,
    nAir,
    airFlowRateM3h,
    nCO2,
    nH2O,
    nSO2,
    nCO,
    nUnburnedH2,
    nO2Excess,
    nN2,
    nNOx,
    SOx_ppm,
    volumePercentagesWet,
    volumePercentagesDry,
    combustionEfficiency,
    flameTemperatureK,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    gasDensity,
    totalMolarMass,
    totalLHV,
    totalHHV
  };
}

// Function to calculate flame temperature (simplified)
function calculateFlameTemperature(T_initial, nFuelCombusted, nAir, heatingValuePerMol) {
  // Simplified calculation assuming constant specific heat capacity
  // Cp of flue gas (approximate): 29 J/(mol·K)
  const Cp_flue_gas = 29; // J/(mol·K)
  const heatReleased = nFuelCombusted * heatingValuePerMol * 1000; // Convert kJ/mol to J/mol
  const deltaT = heatReleased / ((nFuelCombusted + nAir) * Cp_flue_gas); // Temperature rise in K

  return T_initial + deltaT; // Flame temperature in Kelvin
}

// Function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Empirical correlation for thermal NOx formation
  // NOx_ppm = A * exp(B * (T_flame - 2000)) * (O2%)^C
  const A = 6e-6; // Empirical constant
  const B = 0.0004; // Empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent, C) * 1e6; // Convert to ppm

  return NOx_ppm;
}
