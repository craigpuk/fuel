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

// Main calculation function
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

  // First loop: calculate moles per kg mixture and O2 required per mol fuel for each component
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

  const stoichiometricCO2 = mixture.reduce((sum, component, index) => sum + moleFractions[index] * (component.fuel.C || 0), 0);
  const actualCO2 = stoichiometricCO2 / (1 + excessAirFraction);
  const combustionEfficiency = (actualCO2 / stoichiometricCO2) * 100;

  const combustionEfficiencyFraction = combustionEfficiency / 100;
  const nFuelCombusted = nFuel * combustionEfficiencyFraction;
  const nUnburnedFuel = nFuel - nFuelCombusted;

  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuelCombusted, nAir, totalLHV);

  const results = {
    nFuel,
    nAir,
    airFlowRate,
    flowRateUnit,
    totalMolarMass,
    totalLHV,
    totalHHV,
    combustionEfficiency,
    flameTemperatureK,
    stoichiometricCO2,
    actualCO2
  };

  return results;
}

// Flame temperature calculation
function calculateFlameTemperature(T_initial, nFuelCombusted, totalMolesProducts, totalLHV) {
  const Cp_products = 37; // Approximate average J/(mol·K)
  const heatReleased = nFuelCombusted * totalLHV * 1e6; // Convert MJ to J
  const deltaT = heatReleased / (totalMolesProducts * Cp_products);
  return T_initial + deltaT;
}
