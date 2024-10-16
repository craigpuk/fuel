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

// Helper function to parse chemical formulas
function parseFormula(formula) {
  const regex = /([A-Z][a-z]?)(\d*)/g;
  let match;
  const composition = {};

  while ((match = regex.exec(formula)) !== null) {
    const element = match[1];
    const count = match[2] ? parseInt(match[2]) : 1;
    composition[element] = (composition[element] || 0) + count;
  }

  return composition;
}

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

  let molesPerFuel = [];

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

    totalC += weightFraction * (fuel.C || 0); // Carbon content (weight%)
    totalH += weightFraction * (fuel.H || 0); // Hydrogen content (weight%)
    totalO += weightFraction * (fuel.O || 0); // Oxygen content (weight%)
    totalN += weightFraction * (fuel.N || 0); // Nitrogen content (weight%)
    totalS += weightFraction * (fuel.S || 0); // Sulfur content (weight%)

    totalAshContent += weightFraction * (fuel.AshContent || 0); // Ash content
    totalMoistureContent += weightFraction * (fuel.MoistureContent || 0); // Moisture content

    const moles = (weightFraction * 1000) / molarMass; // mol/kg
    molesPerFuel.push(moles);
  });

  // Convert weight fractions to mole fractions
  const totalMoles = molesPerFuel.reduce((acc, val) => acc + val, 0);
  const moleFractions = molesPerFuel.map(moles => moles / totalMoles);

  // Parse fuel formulas to get elemental composition
  const fuelElementCounts = mixture.map(component => {
    const formula = component.fuel.Formula;
    const composition = parseFormula(formula);
    return composition;
  });

  // Calculate stoichiometric CO2 production per mole fuel
  const stoichCO2 = moleFractions.reduce((acc, moleFraction, index) => {
    const composition = fuelElementCounts[index];
    const x = composition['C'] || 0; // Number of C atoms
    return acc + moleFraction * x;
  }, 0);

  // Calculate stoichiometric oxygen requirement per mole fuel
  const stoichO2 = moleFractions.reduce((acc, moleFraction, index) => {
    const composition = fuelElementCounts[index];
    const x = composition['C'] || 0;
    const y = composition['H'] || 0;
    const z = composition['O'] || 0;
    const requiredO2 = x + y / 4 - z / 2;
    return acc + moleFraction * requiredO2;
  }, 0);

  if (stoichO2 <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  const airRequired = stoichO2 / O2FractionInAir; // mol O2 per mol fuel

  const excessAirFraction = excessAirPercentage / 100;

  // Temperature and pressure conversions
  const temperatureK = temperatureC + 273.15;
  const inletAirTemperatureK = inletAirTemperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Calculate fuel flow rate in mol/s
  let nFuel;
  if (isMassFlowRate) {
    const fuelFlowRateKgs = fuelFlowRateInput / 3600; // kg/h to kg/s
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // mol/s
  } else {
    const fuelFlowRateM3s = fuelFlowRateInput / 3600; // m³/h to m³/s
    const fuelGasDensity = calculateGasDensity(totalMolarMass, pressureBar, temperatureK);
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK); // mol/s using Ideal Gas Law
  }

  // Calculate air flow rate required for combustion
  const nAir = nFuel * airRequired * (1 + excessAirFraction); // mol/s

  // Calculate air flow rate in m³/h using Ideal Gas Law
  const airFlowRateM3s = (nAir * R * inletAirTemperatureK) / pressurePa; // m³/s
  const airFlowRateM3h = airFlowRateM3s * 3600; // m³/h

  // Calculate combustion products
  const nCO2 = stoichCO2 * nFuel; // mol/s
  const nH2O = (totalH / 100 * nFuel * (4)) / 2; // mol/s (assuming H2O per mole H)
  const nSO2 = (totalS / 100 * nFuel); // mol/s (assuming SO2 per mole S)
  let nO2Excess = nAir * O2FractionInAir - stoichO2 * nFuel; // mol/s
  if (nO2Excess < 0) nO2Excess = 0;
  const nN2 = nAir * (1 - O2FractionInAir); // mol/s

  // Calculate true combustion efficiency
  // Assuming actual CO2 equals stoichCO2 * nFuel for complete combustion
  // If incomplete combustion, actual CO2 < stoichCO2 * nFuel
  // Without actual measurements, assume complete combustion (100%)
  const actualCO2 = nCO2; // mol/s
  const combustionEfficiency = (actualCO2 / (stoichCO2 * nFuel)) * 100; // Should be 100%

  // Calculate heat released by flue gas
  const deltaT = flueGasTemperatureC - inletAirTemperatureC; // °C = K difference

  const Cp_CO2 = 37; // J/(mol·K)
  const Cp_H2O = 33; // J/(mol·K)
  const Cp_SO2 = 29; // J/(mol·K)
  const Cp_O2 = 29; // J/(mol·K)
  const Cp_N2 = 29; // J/(mol·K)
  const Cp_NOx = 37; // J/(mol·K)

  // Assume NOx is negligible unless calculated
  const heatReleased = (nCO2 * Cp_CO2 + nH2O * Cp_H2O + nSO2 * Cp_SO2 + nO2Excess * Cp_O2 + nN2 * Cp_N2) * deltaT; // J/s

  // Calculate heat input from fuel
  const fuelFlowRateMass_s = isMassFlowRate ? (fuelFlowRateInput / 3600) : (fuelFlowRateInput / 3600) * calculateGasDensity(totalMolarMass, pressureBar, temperatureK);
  const heatInput = fuelFlowRateMass_s * (totalLHV * 1e6); // J/s

  // Calculate thermal combustion efficiency
  const thermalCombustionEfficiency = (heatReleased / heatInput) * 100;

  // Calculate fuel gas density
  const fuelGasDensity = calculateGasDensity(totalMolarMass, pressureBar, temperatureK);

  // Estimate NOx emissions based on flame temperature and excess air
  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuel, nCO2 + nH2O + nSO2 + nO2Excess + nN2, totalLHV);
  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = nN2 * NOx_ppm / 1e6; // mol/s (ppm to mol/s)
  const adjustedN2 = nN2 - nNOx;

  // Calculate SOx emissions
  const totalMolesWet = nCO2 + nH2O + nSO2 + nO2Excess + adjustedN2 + nNOx;
  const SOx_ppm = (nSO2 / totalMolesWet) * 1e6; // ppm

  // Calculate CO emissions (assuming incomplete combustion proportional to efficiency)
  let CO_ppm = 0;
  if (combustionEfficiency < 100) {
    // Simplified assumption: lower efficiency leads to some CO formation
    CO_ppm = ((100 - combustionEfficiency) / 100) * 1000; // ppm (arbitrary scaling)
  }

  // Calculate volume percentages (wet basis)
  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    SO2: (nSO2 / totalMolesWet) * 100,
    O2: (nO2Excess / totalMolesWet) * 100,
    N2: (adjustedN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: 0 // Assuming ash is not gaseous; adjust if necessary
  };

  // Calculate volume percentages (dry basis)
  const totalMolesDry = totalMolesWet - nH2O;
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    O2: (nO2Excess / totalMolesDry) * 100,
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
    trueCombustionEfficiency: combustionEfficiency,
    thermalCombustionEfficiency,
    nCO2,
    nH2O,
    nSO2,
    nO2Excess: nO2Excess,
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
