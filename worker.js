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
  const N2FractionInAir = 0.7808; // Nitrogen fraction in air

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

  let moleFractions = [];
  let totalMolesPerKgMixture = 0;

  // Iterate through fuel mixture to calculate properties
  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass;

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

    const molesPerKg = (weightFraction * 1000) / molarMass;
    totalMolesPerKgMixture += molesPerKg;
    moleFractions.push(molesPerKg);
  });

  // Calculate stoichiometric oxygen requirement (O2 required per mole of fuel)
  const O2RequiredPerMolFuel = totalC + (totalH / 4) + totalS - (totalO / 2);
  if (O2RequiredPerMolFuel <= 0) {
    throw new Error('Invalid fuel composition leading to non-positive oxygen requirement.');
  }

  const airRequiredPerMolFuel = O2RequiredPerMolFuel / O2FractionInAir;
  const excessAirFraction = excessAirPercentage / 100;

  // Temperature and pressure conversions
  const temperatureK = temperatureC + 273.15;
  const inletAirTemperatureK = inletAirTemperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Calculate fuel flow rate in mol/s
  let nFuel;
  if (isMassFlowRate) {
    const fuelFlowRateKgs = fuelFlowRateInput / 3600; // kg/h to kg/s
    nFuel = fuelFlowRateKgs / (totalMolarMass / 1000); // totalMolarMass in g/mol, convert to kg/mol
  } else {
    const fuelFlowRateM3s = fuelFlowRateInput / 3600; // m³/h to m³/s
    nFuel = (pressurePa * fuelFlowRateM3s) / (R * temperatureK); // Ideal gas law: n = PV/RT
  }

  // Calculate air flow rate required for combustion
  const nAir = nFuel * airRequiredPerMolFuel * (1 + excessAirFraction);

  // Calculate air flow rate in m³/h using the ideal gas law
  const airFlowRateM3s = (nAir * R * inletAirTemperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;

  // Calculate combustion products (simplified)
  const nCO2 = totalC * nFuel; // Carbon dioxide (CO2)
  const nH2O = (totalH / 2) * nFuel; // Water vapor (H2O)
  const nSO2 = totalS * nFuel; // Sulfur dioxide (SO2)
  const nO2Excess = nAir * O2FractionInAir - nFuel * O2RequiredPerMolFuel; // Excess O2
  const nN2 = nAir * N2FractionInAir; // Nitrogen (N2)

  // Ensure no negative excess O2
  const O2Excess = nO2Excess > 0 ? nO2Excess : 0;

  // Calculate stoichiometric CO2 (assuming 100% combustion)
  const stoichCO2 = totalC * nFuel;

  // Calculate true combustion efficiency
  const trueCombustionEfficiency = (nCO2 / stoichCO2) * 100;

  // Calculate total moles of flue gas
  const totalMolesFlueGas = nCO2 + nH2O + nSO2 + O2Excess + nN2;

  // Calculate actual CO2 percentage
  const actualCO2Percentage = (nCO2 / totalMolesFlueGas) * 100;

  // Calculate combustion efficiency based on CO2
  const combustionEfficiency = (actualCO2Percentage / (nCO2 / nFuel * 100)) * 100;

  // Calculate fuel gas density using ideal gas law (kg/m³)
  const molarMassKgPerMol = totalMolarMass / 1000; // Convert g/mol to kg/mol
  const gasDensity = (pressurePa * molarMassKgPerMol) / (R * temperatureK);

  // Calculate flame temperature (simplified)
  const Cp_products = 37; // J/(mol·K), approximate average value
  const heatReleased = nFuel * totalLHV * 1e6; // Convert MJ/mol to J/mol
  const deltaT = heatReleased / (totalMolesFlueGas * Cp_products);
  const flameTemperatureK = temperatureK + deltaT;

  // Estimate NOx emissions based on flame temperature and excess air
  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = (nN2 * NOx_ppm) / 1e6; // Convert ppm to mol/s
  const adjustedN2 = nN2 - nNOx; // Adjust N2 after NOx formation

  // Calculate SOx emissions
  const SOx_ppm = (nSO2 / totalMolesFlueGas) * 1e6; // ppm

  // Volume percentages (wet basis)
  const volumePercentagesWet = {
    CO2: (nCO2 / totalMolesFlueGas) * 100,
    H2O: (nH2O / totalMolesFlueGas) * 100,
    SO2: (nSO2 / totalMolesFlueGas) * 100,
    O2: (O2Excess / totalMolesFlueGas) * 100,
    N2: (adjustedN2 / totalMolesFlueGas) * 100,
    NOx: (nNOx / totalMolesFlueGas) * 100
  };

  // Total moles of products (dry basis)
  const totalMolesDry = totalMolesFlueGas - nH2O;

  // Volume percentages (dry basis)
  const volumePercentagesDry = {
    CO2: (nCO2 / totalMolesDry) * 100,
    SO2: (nSO2 / totalMolesDry) * 100,
    O2: (O2Excess / totalMolesDry) * 100,
    N2: (adjustedN2 / totalMolesDry) * 100,
    NOx: (nNOx / totalMolesDry) * 100
  };

  // Measured O2 in flue gas (for NOx correction)
  const measuredO2 = volumePercentagesDry.O2;

  // Advanced NOx Calculations
  const NOx_normalized = NOx_ppm * 2.0536;
  const NOx_flue_gas_temp = NOx_ppm * 2.0536 * (273 / (273 + flueGasTemperatureC));
  const NOx_corrected_O2_normalized = NOx_normalized * ((21 - referenceO2) / (21 - measuredO2));
  const NOx_corrected_O2_actual = NOx_flue_gas_temp * ((21 - referenceO2) / (21 - measuredO2));

  // CO Calculations
  let CO_ppm = 0;
  if (trueCombustionEfficiency < 100) {
    // Assuming incomplete combustion produces CO
    // Simplified calculation: proportion of unburned fuel leads to CO formation
    const nCO = (100 - trueCombustionEfficiency) / 100 * nCO2; // Simplistic assumption
    CO_ppm = (nCO / totalMolesFlueGas) * 1e6; // Convert to ppm
  }

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
    O2Excess,
    adjustedN2,
    nNOx,
    SOx_ppm,
    volumePercentagesWet,
    volumePercentagesDry,
    measuredO2,
    NOx_ppm,
    NOx_normalized,
    NOx_flue_gas_temp,
    NOx_corrected_O2_normalized,
    NOx_corrected_O2_actual,
    CO_ppm,
    gasDensity,
    flameTemperatureK
  };
}

// Function to estimate NOx emissions based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // Empirical correlation for thermal NOx formation
  const A = 1e-5; // Empirical constant
  const B = 0.0006; // Empirical constant
  const C = 0.5; // Empirical constant
  const O2_percent = excessAirFraction * 100; // Excess O2 percentage

  const NOx_ppm = A * Math.exp(B * (flameTemperatureK - 2000)) * Math.pow(O2_percent + 1, C) * 1e6; // Convert to ppm

  return NOx_ppm;
}
