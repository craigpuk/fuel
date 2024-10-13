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
  const O2FractionInAir = 0.2095; // Oxygen fraction in dry air
  const N2FractionInAir = 0.7808; // Nitrogen fraction in dry air
  const H2OFractionInAir = 0.0097; // Water vapor fraction in inlet air (from humidity)

  // Adjust O2 and N2 fractions based on relative humidity
  const inletAirMoistureFraction = relativeHumidity / 100; // Convert percentage to fraction
  const adjustedO2FractionInAir = O2FractionInAir * (1 - inletAirMoistureFraction);
  const adjustedN2FractionInAir = N2FractionInAir * (1 - inletAirMoistureFraction);
  const adjustedH2OFractionInAir = H2OFractionInAir + inletAirMoistureFraction;

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
    const Cl = (fuel.Cl || 0);
    const P = (fuel.P || 0);

    // Stoichiometric combustion equation: Cc Hh Ss Oo Nn Clc Pp + a O2 + b N2 → c CO2 + d H2O + e SO2 + f NOx + g ash
    // O2 required per mole of fuel:
    // a = (c + d/2 + e + f/4) - (o/2)
    // For simplicity, assuming f (NOx) is based on fuel nitrogen, which is handled separately
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

  // Air required per mole of fuel (using adjusted O2 content in air)
  const airRequiredPerMolFuel = O2RequiredPerMolFuel / adjustedO2FractionInAir;

  // Excess air fraction
  const excessAirFraction = excessAirPercentage / 100;

  // Temperature and pressure conversions
  const inletAirTemperatureK = inletAirTemperatureC + 273.15;
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Adjust inlet air composition based on relative humidity
  const O2_fraction = adjustedO2FractionInAir;
  const N2_fraction = adjustedN2FractionInAir;
  const H2O_fraction = adjustedH2OFractionInAir;

  // Molar flow rate of fuel (mol/s)
  let nFuel;
  if (isMassFlowRate) {
    // Mass flow rate (kg/h to kg/s)
    const fuelFlowRateKgs = fuelFlowRateInput / 3600;
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // totalMolarMass in g/mol, convert to kg/mol
  } else {
    // Volumetric flow rate (m³/h to m³/s) using ideal gas law
    const fuelFlowRateM3s = fuelFlowRateInput / 3600;
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK);
  }

  // Molar flow rate of air required (mol/s)
  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirFraction);

  // Air flow rate using the ideal gas law
  const airFlowRateM3s = (nAir * R * inletAirTemperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;
  const airFlowRateKgs = nAir * 28.97e-3; // molar mass of dry air in kg/mol
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

  // Combustion Efficiency Calculation based on CO₂%
  // Step 1: Calculate stoichiometric CO₂% based on fuel composition
  let stoichCO2_mol = 0;
  let stoichSO2_mol = 0;
  let stoichNOx_mol = 0;

  mixture.forEach((component, index) => {
    const fuel = component.fuel;
    stoichCO2_mol += moleFractions[index] * fuel.C * nFuel;
    stoichSO2_mol += moleFractions[index] * fuel.S * nFuel;
    stoichNOx_mol += moleFractions[index] * fuel.N * nFuel;
  });

  // At stoichiometric conditions, no excess air, so:
  const nAir_stoich = nFuel * airRequiredPerMolFuel;
  const nN2Air_stoich = nAir_stoich * N2FractionInAir;
  const nH2O_stoich = 0; // No moisture assumed in stoichiometric calculations

  // Moles of dry products at stoichiometric conditions
  const nCO2_stoich = stoichCO2_mol;
  const nSO2_stoich = stoichSO2_mol;
  const nNOx_stoich = stoichNOx_mol;
  const nN2_stoich = nN2Air_stoich + stoichNOx_mol * 1; // Assuming each NOx molecule releases one N atom as N2 or NOx

  const nAsh_stoich = nFuel * (totalAshContent / 100);

  // Total moles dry products at stoich
  const totalMolesDryProducts_stoich = nCO2_stoich + nSO2_stoich + nNOx_stoich + nN2_stoich + nAsh_stoich;

  // Stoichiometric CO₂% (dry basis)
  const stoichCO2_percent = (nCO2_stoich / totalMolesDryProducts_stoich) * 100;

  // Step 2: Get actual CO₂% from current combustion
  const actualCO2_percent = (resultsCalcCO2(mixture, nFuel, combustionEfficiencyFraction)) / resultsTotalMolesDry(resultsCalcCO2(mixture, nFuel, combustionEfficiencyFraction), resultsCalcOtherProducts(resultsCalcCO2(mixture, nFuel, combustionEfficiencyFraction))) * 100;

  // But more accurately, since combustionEfficiency is already based on CO2% over stoichCO2%, we'll calculate it as:
  // combustionEfficiency = (actualCO2_percent / stoichCO2_percent) * 100

  // Proceed with other calculations to get actualCO2_percent

  // First, perform combustion calculations based on fuel and air
  const combustionResults = calculateCombustionProducts(
    mixture,
    nFuel,
    nAir,
    adjustedO2FractionInAir,
    adjustedN2FractionInAir,
    adjustedH2OFractionInAir,
    totalAshContent
  );

  // Actual CO2% based on combustion
  const actualCO2_percent_calculated = (combustionResults.nCO2 / combustionResults.totalMolesDryProducts) * 100;

  // Combustion Efficiency
  const combustionEfficiency = (actualCO2_percent_calculated / stoichCO2_percent) * 100;

  // Heat Balance Calculations
  const heatBalanceResults = calculateHeatBalance(
    temperatureK,
    combustionResults.nFuelCombusted,
    combustionResults.totalMolesProducts,
    totalLHV
  );

  // NOx Emissions Estimation
  const NOx_ppm = estimateNOx(combustionResults.flameTemperatureK, excessAirFraction);
  const nNOx = combustionResults.nN2 * NOx_ppm / 1e6; // Convert ppm to mol/s
  combustionResults.nN2 -= nNOx; // Adjust N2 after NOx formation

  // SOx Emissions
  const totalMolesWet = combustionResults.totalMolesProducts + nNOx;
  const SOx_ppm = (combustionResults.nSO2 / totalMolesWet) * 1e6; // ppm

  // Volume percentages (wet basis)
  const volumePercentagesWet = {
    CO2: (combustionResults.nCO2 / totalMolesWet) * 100,
    H2O: (combustionResults.nH2O / totalMolesWet) * 100,
    SO2: (combustionResults.nSO2 / totalMolesWet) * 100,
    CO: (combustionResults.nCO / totalMolesWet) * 100,
    H2: (combustionResults.nUnburnedH2 / totalMolesWet) * 100,
    O2: (combustionResults.nO2Excess / totalMolesWet) * 100,
    N2: (combustionResults.nN2 / totalMolesWet) * 100,
    NOx: (nNOx / totalMolesWet) * 100,
    Ash: (combustionResults.nAsh / totalMolesWet) * 100
  };

  // Total moles of products (dry basis)
  const totalMolesDry = totalMolesWet - combustionResults.nH2O;

  // Volume percentages (dry basis)
  const volumePercentagesDry = {
    CO2: (combustionResults.nCO2 / totalMolesDry) * 100,
    SO2: (combustionResults.nSO2 / totalMolesDry) * 100,
    CO: (combustionResults.nCO / totalMolesDry) * 100,
    H2: (combustionResults.nUnburnedH2 / totalMolesDry) * 100,
    O2: (combustionResults.nO2Excess / totalMolesDry) * 100,
    N2: (combustionResults.nN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100,
    Ash: (combustionResults.nAsh / totalMolesDry) * 100
  };

  // Measured O2 in flue gas (for NOx correction)
  const measuredO2 = volumePercentagesDry.O2;

  // Advanced NOx Calculations
  const NOx_normalized = NOx_ppm * 2.0536; // Example conversion factor
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  // CO Calculations
  // Only calculate CO ppm if combustion efficiency < 100%
  let CO_ppm = 0;
  if (combustionEfficiency / 100 < 1) {
    CO_ppm = (combustionResults.nCO / totalMolesWet) * 1e6; // Convert to ppm
  }

  // Calculate Fuel Gas Density
  const fuelGasDensity = (totalMolarMass) / (22.414 * (pressureBar / 1)); // kg/m³ at standard conditions

  // Prepare results object
  return {
    totalMolarMass,
    totalLHV,
    totalHHV,
    nFuel,
    nAir,
    airFlowRate,
    flowRateUnit,
    combustionResults: {
      nCO2: combustionResults.nCO2,
      nH2O: combustionResults.nH2O,
      nSO2: combustionResults.nSO2,
      nCO: combustionResults.nCO,
      nUnburnedH2: combustionResults.nUnburnedH2,
      nO2Excess: combustionResults.nO2Excess,
      nN2: combustionResults.nN2,
      nNOx,
      nAsh: combustionResults.nAsh,
      totalMolesProducts: combustionResults.totalMolesProducts,
      flameTemperatureK: heatBalanceResults.flameTemperatureK,
      nFuelCombusted: combustionResults.nFuelCombusted
    },
    SOx_ppm,
    volumePercentagesWet,
    volumePercentagesDry,
    combustionEfficiency,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    CO_ppm,
    fuelGasDensity,
    stoichCO2_percent
  };
}

// Helper function to calculate combustion products
function calculateCombustionProducts(
  mixture,
  nFuel,
  nAir,
  O2_fraction,
  N2_fraction,
  H2O_fraction,
  totalAshContent
) {
  // Initialize product moles
  let nCO2 = 0;
  let nH2O = 0;
  let nSO2 = 0;
  let nNOx = 0;
  let nCO = 0;
  let nUnburnedH2 = 0;
  let nO2Excess = 0;
  let nN2 = 0;
  let nAsh = 0;

  // Calculate products based on fuel composition
  mixture.forEach(component => {
    const fuel = component.fuel;
    const C = fuel.C || 0;
    const H = fuel.H || 0;
    const S = fuel.S || 0;
    const N = fuel.N || 0;

    nCO2 += C * nFuel;
    nH2O += (H / 2) * nFuel;
    nSO2 += S * nFuel;
    nNOx += N * nFuel;
  });

  // Assuming all unburned fuel forms CO and H2
  // For stoichiometric combustion, no unburned fuel
  // Here, based on combustion efficiency, unburned fuel is handled
  // However, in this simplified model, we'll assume complete combustion except for efficiency adjustments

  // Calculate excess oxygen
  // Oxygen consumed is based on stoichiometric requirements
  // Oxygen supplied is based on air flow
  // Excess oxygen = supplied - consumed
  // But since actual combustion efficiency affects fuel combustion, adjustments are needed
  // For simplicity, assuming excess air is already considered in air flow

  // Calculate nitrogen
  nN2 = nAir * N2_fraction;

  // Calculate ash
  nAsh = nFuel * (totalAshContent / 100);

  // Total moles of products
  const totalMolesProducts = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nAsh;

  // Assume no unburned fuel for stoichiometric combustion
  // Adjust based on combustion efficiency elsewhere

  return {
    nCO2,
    nH2O,
    nSO2,
    nCO,
    nUnburnedH2,
    nO2Excess,
    nN2,
    nAsh,
    totalMolesProducts,
    nFuelCombusted: nFuel // Placeholder, adjust based on efficiency
  };
}

// Helper function to calculate heat balance
function calculateHeatBalance(T_initial, nFuelCombusted, totalMolesProducts, heatingValuePerMol) {
  // Use average specific heat capacity of products at high temperatures
  const Cp_products = 37; // J/(mol·K), approximate average value

  // Total heat released (J/s)
  const heatReleased = nFuelCombusted * heatingValuePerMol * 1e6; // Convert MJ/mol to J/mol

  // Temperature rise (K)
  const deltaT = heatReleased / (totalMolesProducts * Cp_products);

  return {
    flameTemperatureK: T_initial + deltaT
  };
}

// Helper function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Empirical correlation for thermal NOx formation
  const A = 1e-5; // Adjusted empirical constant
  const B = 0.0006; // Adjusted empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent + 1, C) * 1e6; // Convert to ppm

  return NOx_ppm;
}
