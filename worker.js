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
  referenceO2
) {
  const R = 8.314; // J/(mol·K)
  const O2FractionInAir = 0.2095; // Oxygen fraction in air

  let totalMolarMass = 0;
  let totalLHV = 0;
  let totalHHV = 0;
  let moleFractions = [];
  let O2RequiredPerMolFuel_components = [];
  let totalMolesPerKgMixture = 0;
  let totalAshContent = 0;
  let totalMoistureContent = 0;

  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass;

    if (!molarMass || molarMass <= 0) {
      throw new Error(`Invalid or undefined molar mass for ${fuel.Name}.`);
    }

    const heatingValue = fuel.HeatingValue * (1 - (fuel.MoistureContent || 0) / 100);
    totalMolarMass += weightFraction * molarMass;
    totalLHV += weightFraction * heatingValue;
    totalHHV += weightFraction * (fuel.HHV || 0);
    totalAshContent += weightFraction * (fuel.AshContent || 0);
    totalMoistureContent += weightFraction * (fuel.MoistureContent || 0);

    const combustibleFraction = 1 - ((fuel.AshContent || 0) + (fuel.MoistureContent || 0)) / 100;
    const molesPerKg = (weightFraction * combustibleFraction * 1000) / molarMass;
    totalMolesPerKgMixture += molesPerKg;

    const C = (fuel.C || 0);
    const H = (fuel.H || 0);
    const S = (fuel.S || 0);
    const O = (fuel.O || 0);
    const N = (fuel.N || 0);

    const O2RequiredPerMolFuel = C + H / 4 + S - O / 2;
    O2RequiredPerMolFuel_components.push(O2RequiredPerMolFuel);
    moleFractions.push(0);
  });

  mixture.forEach((component, index) => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass;
    const combustibleFraction = 1 - ((fuel.AshContent || 0) + (fuel.MoistureContent || 0)) / 100;

    const molesPerKg = (weightFraction * combustibleFraction * 1000) / molarMass;
    const moleFraction = molesPerKg / totalMolesPerKgMixture;
    moleFractions[index] = moleFraction;
  });

  let O2RequiredPerMolFuel = 0;
  O2RequiredPerMolFuel_components.forEach((O2Required, index) => {
    O2RequiredPerMolFuel += moleFractions[index] * O2Required;
  });

  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  const airRequiredPerMolFuel = O2RequiredPerMolFuel / O2FractionInAir;
  const excessAirFraction = excessAirPercentage / 100;

  const inletAirTemperatureK = inletAirTemperatureC + 273.15;
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  let nFuel;
  if (isMassFlowRate) {
    const fuelFlowRateKgs = fuelFlowRateInput / 3600;
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000);
  } else {
    const fuelFlowRateM3s = fuelFlowRateInput / 3600;
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK);
  }

  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirFraction);

  const airFlowRateM3s = (nAir * R * inletAirTemperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;
  const airFlowRateKgs = nAir * 28.97e-3;
  const airFlowRateKgh = airFlowRateKgs * 3600;

  let airFlowRate;
  let flowRateUnit;
  if (isMassFlowRate) {
    airFlowRate = airFlowRateKgh;
    flowRateUnit = 'kg/h';
  } else {
    airFlowRate = airFlowRateM3h;
    flowRateUnit = 'm³/h';
  }

  let combustionEfficiency;
  if (excessAirFraction >= 0) {
    combustionEfficiency = 100;
  } else {
    combustionEfficiency = (1 + excessAirFraction) * 100;
    if (combustionEfficiency < 0) combustionEfficiency = 0;
  }
  const combustionEfficiencyFraction = combustionEfficiency / 100;

  const nFuelCombusted = nFuel * combustionEfficiencyFraction;
  const nUnburnedFuel = nFuel - nFuelCombusted;
  const nN2Air = nAir * (1 - O2FractionInAir);

  const totalC = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.C || 0), 0);
  const totalH = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.H || 0), 0);
  const totalS = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.S || 0), 0);
  const totalO = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.O || 0), 0);
  const totalN = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.N || 0), 0);

  const nC = totalC * nFuelCombusted;
  const nH = totalH * nFuelCombusted;
  const nS = totalS * nFuelCombusted;
  const nO = totalO * nFuelCombusted;
  const nNFuel = totalN * nFuelCombusted;

  const nCO2 = nC;
  const nH2O = nH / 2;
  const nSO2 = nS;
  const nCO = (nUnburnedFuel / nFuelCombusted) * nC;
  const nUnburnedH2 = (totalH * nUnburnedFuel) / 2;
  const nAsh = nFuel * (totalAshContent / 100);

  const nO2Consumed = nFuelCombusted * O2RequiredPerMolFuel;
  const nO2Supplied = nAir * O2FractionInAir;
  let nO2Excess = nO2Supplied - nO2Consumed;
  if (nO2Excess < 0) nO2Excess = 0;

  let nN2 = nN2Air + nNFuel;

  const heatingValuePerMol = totalLHV * totalMolarMass / 1000;
  const totalMolesProducts = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nAsh;
  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuelCombusted, totalMolesProducts, heatingValuePerMol);

  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = nN2 * NOx_ppm / 1e6;
  nN2 -= nNOx;

  const totalMolesWet = totalMolesProducts + nNOx;
  const SOx_ppm = (nSO2 / totalMolesWet) * 1e6;

  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesWet) * 100,
    H2O: (nH2O / totalMolesWet) * 100,
    SO2: (nSO2 / totalMolesWet) * 100,
    H2: (nUnburnedH2 / totalMolesWet) * 100,
    O2: (nO2Excess / totalMolesWet) * 100,
    N2: (nN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: (nAsh / totalMolesWet) * 100
  };

  const totalMolesDry = totalMolesWet - nH2O;
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    H2: (nUnburnedH2 / totalMolesDry) * 100,
    O2: (nO2Excess / totalMolesDry) * 100,
    N2: (nN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100,
    Ash: (nAsh / totalMolesDry) * 100
  };

  const measuredO2 = volumePercentagesDry.O2;

  const NOx_normalized = NOx_ppm * 2.0536;
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  let CO_ppm = 0;
  if (combustionEfficiencyFraction < 1) {
    CO_ppm = (nCO / totalMolesWet) * 1e6;
  }

  const fuelGasDensity = calculateGasDensity(totalMolarMass, pressureBar, temperatureK);

  // Calculate true combustion efficiency based on stoichiometric and actual CO2
  const actualCO2 = (nCO2 / totalMolesProducts) * 100;
  const stoichCO2 = calculateStoichCO2(mixture); // Implement stoichiometric CO2 calculation based on fuel
  const trueCombustionEfficiency = calculateCombustionEfficiency(actualCO2, stoichCO2);

  return {
    nFuel,
    nAir,
    airFlowRate,
    flowRateUnit,
    nCO2,
    nH2O,
    nSO2,
    nCO,
    nUnburnedH2,
    nO2Excess,
    nN2,
    nNOx,
    nAsh,
    SOx_ppm,
    volumePercentagesWet,
    volumePercentagesDry,
    combustionEfficiency,
    trueCombustionEfficiency, // New efficiency based on CO2
    flameTemperatureK,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    CO_ppm,
    fuelGasDensity,
    totalMolarMass,
    totalLHV,
    totalHHV
  };
}

// Updated gas density calculation function
function calculateGasDensity(totalMolarMass, pressureBar, temperatureK) {
  const R = 8.314; // Universal gas constant J/(mol·K)
  const pressurePa = pressureBar * 1e5; // Convert pressure from bar to Pascals
  const molarMassKgPerMol = totalMolarMass / 1000; // Convert g/mol to kg/mol

  // Ideal gas law: ρ = (P * M) / (R * T)
  const gasDensity = (pressurePa * molarMassKgPerMol) / (R * temperatureK);

  return gasDensity; // Density in kg/m³
}

// Function to calculate stoichiometric CO2 based on fuel
function calculateStoichCO2(mixture) {
  // Implement the calculation of stoichiometric CO2 based on fuel composition
  let stoichCO2 = 0;

  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const C = fuel.C || 0;
    const H = fuel.H || 0;
    const S = fuel.S || 0;

    // For every mole of C, you get one mole of CO2
    stoichCO2 += weightFraction * C;
  });

  return stoichCO2;
}

// Function to calculate true combustion efficiency
function calculateCombustionEfficiency(actualCO2, stoichCO2) {
  if (stoichCO2 <= 0) {
    throw new Error("Invalid stoichiometric CO2 percentage.");
  }
  return (actualCO2 / stoichCO2) * 100;
}

// Function to calculate flame temperature (improved)
function calculateFlameTemperature(T_initial, nFuelCombusted, totalMolesProducts, heatingValuePerMol) {
  const Cp_products = 37; // J/(mol·K), approximate average value
  const heatReleased = nFuelCombusted * heatingValuePerMol * 1e6; // Convert MJ/mol to J/mol
  const deltaT = heatReleased / (totalMolesProducts * Cp_products);

  return T_initial + deltaT; // Flame temperature in Kelvin
}

// Function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  const A = 1e-5; // Adjusted empirical constant
  const B = 0.0006; // Adjusted empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent + 1, C) * 1e6; // Convert to ppm

  return NOx_ppm;
}
