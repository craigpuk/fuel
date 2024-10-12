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
      referenceO2
    );

    postMessage(results);
  } catch (error) {
    postMessage({ error: error.message });
  }
};

// Calculation logic
function performCalculations(mixture, temperatureC, pressureBar, fuelFlowRateInput, isMassFlowRate, excessAirPercentage, flueGasTemperatureC, referenceO2) {
  // Constants
  const R = 8.314; // J/(mol·K)
  const O2FractionInAir = 0.2095; // Oxygen fraction in air

  // Initialize variables
  let totalMolarMass = 0;
  let totalLHV = 0;
  let totalHHV = 0;

  // Arrays to store component data
  let moleFractions = [];
  let O2RequiredPerMolFuel_components = [];

  // Total moles per kg of mixture
  let totalMolesPerKgMixture = 0;

  // Total ash and moisture content
  let totalAshContent = 0;
  let totalMoistureContent = 0;

  // First loop: calculate moles per kg mixture and O2 required per mol fuel for each component
  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass; // g/mol

    if (!molarMass || molarMass <= 0) {
      throw new Error(`Invalid or undefined molar mass for ${fuel.Name}.`);
    }

    // Adjust heating values for moisture content
    const heatingValue = fuel.HeatingValue * (1 - (fuel.MoistureContent || 0) / 100);

    // Sum properties weighted by weight fraction
    totalMolarMass += weightFraction * molarMass;
    totalLHV += weightFraction * heatingValue; // MJ/kg
    totalHHV += weightFraction * (fuel.HHV || 0); // MJ/kg

    // Total ash and moisture content
    totalAshContent += weightFraction * (fuel.AshContent || 0);
    totalMoistureContent += weightFraction * (fuel.MoistureContent || 0);

    // Calculate moles per kg of this component (excluding ash and moisture)
    const combustibleFraction = 1 - ((fuel.AshContent || 0) + (fuel.MoistureContent || 0)) / 100;
    const molesPerKg = (weightFraction * combustibleFraction * 1000) / molarMass; // mol/kg
    totalMolesPerKgMixture += molesPerKg;

    // Calculate O2 required per mole of this fuel
    const C = (fuel.C || 0);
    const H = (fuel.H || 0);
    const S = (fuel.S || 0);
    const O = (fuel.O || 0);
    const N = (fuel.N || 0);

    const O2RequiredPerMolFuel = C + H / 4 + S - O / 2;
    O2RequiredPerMolFuel_components.push(O2RequiredPerMolFuel);

    // Store mole fraction for this component (to be calculated later)
    moleFractions.push(0); // Placeholder
  });

  // Calculate mole fractions for each component
  mixture.forEach((component, index) => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass; // g/mol
    const combustibleFraction = 1 - ((fuel.AshContent || 0) + (fuel.MoistureContent || 0)) / 100;

    const molesPerKg = (weightFraction * combustibleFraction * 1000) / molarMass; // mol/kg
    const moleFraction = molesPerKg / totalMolesPerKgMixture;
    moleFractions[index] = moleFraction;
  });

  // Calculate average O2 required per mole of fuel
  let O2RequiredPerMolFuel = 0;
  O2RequiredPerMolFuel_components.forEach((O2Required, index) => {
    O2RequiredPerMolFuel += moleFractions[index] * O2Required;
  });

  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  // Air required per mole of fuel (using precise O2 content in air)
  const airRequiredPerMolFuel = O2RequiredPerMolFuel / O2FractionInAir;

  // Excess air fraction
  const excessAirFraction = excessAirPercentage / 100;

  // Temperature and pressure conversions
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Molar flow rate of fuel (mol/s)
  let nFuel;
  if (isMassFlowRate) {
    // Mass flow rate (kg/h to kg/s)
    const fuelFlowRateKgs = fuelFlowRateInput / 3600;
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // totalMolarMass in g/mol, convert to kg/mol
  } else {
    // Volumetric flow rate (m³/h to m³/s)
    const fuelFlowRateM3s = fuelFlowRateInput / 3600;
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK);
  }

  // Molar flow rate of air required (mol/s)
  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirFraction);

  // Air flow rate using the ideal gas law
  const airFlowRateM3s = (nAir * R * temperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;
  const airFlowRateKgs = nAir * 28.97e-3; // molar mass of air in kg/mol
  const airFlowRateKgh = airFlowRateKgs * 3600;

  // Determine flow rate unit
  let airFlowRate;
  let flowRateUnit;
  if (isMassFlowRate) {
    airFlowRate = airFlowRateKgh;
    flowRateUnit = 'kg/h';
  } else {
    airFlowRate = airFlowRateM3h;
    flowRateUnit = 'm³/h';
  }

  // Combustion efficiency estimation based on excess air
  const combustionEfficiency = 100 - (excessAirFraction * 2); // Simplified estimation
  const combustionEfficiencyFraction = combustionEfficiency / 100;

  // Adjust fuel combusted based on combustion efficiency
  const nFuelCombusted = nFuel * combustionEfficiencyFraction;
  const nUnburnedFuel = nFuel - nFuelCombusted;

  // Total N2 from air
  const nN2Air = nAir * (1 - O2FractionInAir);

  // Moles of elements combusted
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

  // Products from combustion
  const nCO2 = nC; // All combusted carbon forms CO2
  const nH2O = nH / 2; // H2 forms H2O
  const nSO2 = nS; // Sulfur forms SO2
  const nCO = totalC * nUnburnedFuel; // Unburned carbon forms CO
  const nUnburnedH2 = (totalH * nUnburnedFuel) / 2; // Unburned hydrogen

  // Ash remains as solid
  const nAsh = nFuel * (totalAshContent / 100);

  // Oxygen consumed
  const nO2Consumed = nFuelCombusted * O2RequiredPerMolFuel;
  const nO2Supplied = nAir * O2FractionInAir;
  let nO2Excess = nO2Supplied - nO2Consumed;
  if (nO2Excess < 0) nO2Excess = 0;

  // Nitrogen in flue gas
  let nN2 = nN2Air + nNFuel;

  // Simplified NOx estimation using empirical correlation
  const heatingValuePerMol = totalLHV * totalMolarMass / 1000; // Convert MJ/kg to kJ/mol

  // Calculate total moles of products
  const totalMolesProducts = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nAsh;

  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuelCombusted, totalMolesProducts, heatingValuePerMol);

  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = nN2 * NOx_ppm / 1e6; // Convert ppm to molar flow rate
  nN2 -= nNOx; // Adjust N2 after NOx formation

  // SOx emissions
  const totalMolesWet = totalMolesProducts + nNOx;
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
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: (nAsh / totalMolesWet) * 100
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
    NOx: (nNOx / totalMolesDry) * 100,
    Ash: (nAsh / totalMolesDry) * 100
  };

  // Measured O2 in flue gas (for NOx correction)
  const measuredO2 = volumePercentagesDry.O2;

  // Advanced NOx Calculations
  const NOx_normalized = NOx_ppm * 2.0536;
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  // Calculate Fuel Gas Density
  const fuelGasDensity = (totalMolarMass) / (22.414 * (pressureBar / 1)); // kg/m³ at standard conditions

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
    flameTemperatureK,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    fuelGasDensity,
    totalMolarMass,
    totalLHV,
    totalHHV
  };
}

// Function to calculate flame temperature (improved)
function calculateFlameTemperature(T_initial, nFuelCombusted, totalMolesProducts, heatingValuePerMol) {
  // Use average specific heat capacity of products at high temperatures
  const Cp_products = 37; // J/(mol·K), approximate average value

  // Total heat released (J/s)
  const heatReleased = nFuelCombusted * heatingValuePerMol * 1e6; // Convert MJ/mol to J/mol

  // Temperature rise (K)
  const deltaT = heatReleased / (totalMolesProducts * Cp_products);

  return T_initial + deltaT; // Flame temperature in Kelvin
}

// Function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Empirical correlation for thermal NOx formation
  const A = 1e-5; // Adjusted empirical constant
  const B = 0.0006; // Adjusted empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent + 1, C) * 1e6; // Convert to ppm

  return NOx_ppm;
}
