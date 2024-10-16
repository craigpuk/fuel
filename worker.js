// worker.js

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
    referenceO2
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
      referenceO2
    );

    postMessage(results);
  } catch (error) {
    postMessage({ error: error.message });
  }
};

// Core calculation logic
function performCalculations(
  mixture,
  temperatureC,
  pressureBar,
  fuelFlowRateInput,
  isMassFlowRate,
  excessAirPercentage,
  flueGasTemperatureC,
  inletAirTemperatureC,
  referenceO2
) {
  const R = 8.314; // Universal gas constant J/(mol·K)
  const O2FractionInAir = 0.2095; // Oxygen fraction in air

  let totalMolarMass = 0;
  let totalLHV = 0;
  let totalHHV = 0;
  let totalC = 0;
  let totalH = 0;
  let totalO = 0;
  let totalN = 0;
  let totalS = 0;

  let totalAshContent = 0;
  let totalMoistureContent = 0;

  // Calculate total properties of the fuel mixture
  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass;

    // Validate molar mass
    if (!molarMass || molarMass <= 0) {
      throw new Error(`Invalid or undefined molar mass for ${fuel.Name}.`);
    }

    totalMolarMass += weightFraction * molarMass;
    totalLHV += weightFraction * fuel.HeatingValue; // Lower Heating Value (LHV)
    totalHHV += weightFraction * (fuel.HHV || 0); // Higher Heating Value (HHV)

    totalC += weightFraction * (fuel.C || 0); // Carbon content
    totalH += weightFraction * (fuel.H || 0); // Hydrogen content
    totalO += weightFraction * (fuel.O || 0); // Oxygen content
    totalN += weightFraction * (fuel.N || 0); // Nitrogen content
    totalS += weightFraction * (fuel.S || 0); // Sulfur content

    totalAshContent += weightFraction * (fuel.AshContent || 0); // Ash content
    totalMoistureContent += weightFraction * (fuel.MoistureContent || 0); // Moisture content
  });

  // Calculate stoichiometric oxygen requirement (O2 required per mole of fuel)
  const O2RequiredPerMolFuel = totalC + (totalH / 4) + totalS - (totalO / 2);
  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  // Calculate stoichiometric CO2 (assuming complete combustion)
  const stoichCO2 = totalC; // For every mole of C, one mole of CO2 is produced

  // Calculate molar flow rates
  const temperatureK = temperatureC + 273.15;
  const inletAirTemperatureK = inletAirTemperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  let nFuel;
  if (isMassFlowRate) {
    const fuelFlowRateKgs = fuelFlowRateInput / 3600; // Convert kg/h to kg/s
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // mol/s
  } else {
    const fuelFlowRateM3s = fuelFlowRateInput / 3600; // Convert m³/h to m³/s
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK); // mol/s using Ideal Gas Law
  }

  // Calculate air flow rate required for combustion
  const nAir = nFuel * O2RequiredPerMolFuel / O2FractionInAir * (1 + excessAirPercentage / 100); // mol/s

  // Calculate air flow rate in m³/h using Ideal Gas Law
  const airFlowRateM3s = (nAir * R * inletAirTemperatureK) / pressurePa; // m³/s
  const airFlowRateM3h = airFlowRateM3s * 3600; // m³/h

  // Calculate combustion products
  const nCO2 = totalC * nFuel; // mol/s
  const nH2O = (totalH / 2) * nFuel; // mol/s
  const nSO2 = totalS * nFuel; // mol/s
  const nO2Excess = nAir * O2FractionInAir - nFuel * O2RequiredPerMolFuel; // mol/s
  const nN2 = nAir * (1 - O2FractionInAir); // mol/s

  // Ensure no negative excess O2
  const adjustedO2Excess = nO2Excess > 0 ? nO2Excess : 0;

  // Calculate true combustion efficiency
  const actualCO2 = nCO2; // mol/s
  const trueCombustionEfficiency = (actualCO2 / stoichCO2) * 100;

  // Calculate fuel gas density using Ideal Gas Law
  const fuelGasDensity = calculateGasDensity(totalMolarMass, pressureBar, temperatureK);

  // Estimate flame temperature (simplified)
  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuel, nCO2 + nH2O + nSO2 + adjustedO2Excess + nN2, totalLHV);

  // Estimate NOx emissions based on flame temperature and excess air
  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirPercentage);
  const nNOx = nN2 * NOx_ppm / 1e6; // Convert ppm to mol/s
  const adjustedN2 = nN2 - nNOx;

  // Calculate SOx emissions
  const totalMolesWet = nCO2 + nH2O + nSO2 + adjustedO2Excess + adjustedN2 + nNOx;
  const SOx_ppm = (nSO2 / totalMolesWet) * 1e6; // ppm

  // Calculate CO emissions (assuming incomplete combustion proportional to efficiency)
  let CO_ppm = 0;
  if (trueCombustionEfficiency < 100) {
    // Simplified assumption: lower efficiency leads to some CO formation
    CO_ppm = ((100 - trueCombustionEfficiency) / 100) * 1000; // ppm (adjust based on actual relationship)
  }

  // Calculate volume percentages (wet basis)
  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    SO2: (nSO2 / totalMolesWet) * 100,
    O2: (adjustedO2Excess / totalMolesWet) * 100,
    N2: (adjustedN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: 0 // Assuming ash is not gaseous; adjust if necessary
  };

  // Calculate volume percentages (dry basis)
  const totalMolesDry = totalMolesWet - nH2O;
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    O2: (adjustedO2Excess / totalMolesDry) * 100,
    N2: (adjustedN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100,
    Ash: 0 // Assuming ash is not gaseous; adjust if necessary
  };

  // Advanced NOx Calculations
  const measuredO2 = volumePercentagesDry.O2;
  const NOx_normalized = NOx_ppm * 2.0536;
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  return {
    totalMolarMass,
    totalLHV,
    totalHHV,
    nFuel,
    nAir,
    airFlowRateM3h,
    trueCombustionEfficiency,
    nCO2,
    nH2O,
    nSO2,
    nO2Excess: adjustedO2Excess,
    nN2: adjustedN2,
    nNOx,
    SOx_ppm,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    CO_ppm,
    fuelGasDensity,
    volumePercentagesWet,
    volumePercentagesDry
  };
}

// Function to calculate gas density using Ideal Gas Law
function calculateGasDensity(totalMolarMass, pressureBar, temperatureK) {
  const R = 8.314; // J/(mol·K)
  const pressurePa = pressureBar * 1e5; // Convert bar to Pa
  const molarMassKgPerMol = totalMolarMass / 1000; // g/mol to kg/mol

  const gasDensity = (pressurePa * molarMassKgPerMol) / (R * temperatureK); // kg/m³

  return gasDensity;
}

// Function to calculate flame temperature (simplified)
function calculateFlameTemperature(T_initial, nFuelCombusted, totalMolesProducts, heatingValuePerMol) {
  const Cp_products = 37; // J/(mol·K), average specific heat capacity
  const heatReleased = nFuelCombusted * heatingValuePerMol * 1e6; // MJ/mol to J/mol
  const deltaT = heatReleased / (totalMolesProducts * Cp_products); // K

  return T_initial + deltaT; // Kelvin
}

// Function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Empirical correlation for thermal NOx formation
  const A = 1e-5; // Empirical constant
  const B = 0.0006; // Empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent + 1, C) * 1e6; // ppm

  return NOx_ppm;
}
