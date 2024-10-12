// script.js

// Global variables
let fuelData = [];
let fuelCount = 0;

// Fetch fuel data from JSON file
fetch('fuel_data.json')
  .then(response => response.json())
  .then(data => {
    fuelData = data;
    initializeFuelSelection();
  })
  .catch(error => console.error('Error loading fuel data:', error));

// Initialize fuel selection
function initializeFuelSelection() {
  document.getElementById('add-fuel-button').addEventListener('click', addFuel);
  addFuel(); // Add the first fuel selection
}

// Add a new fuel selection row
function addFuel() {
  const fuelList = document.getElementById('fuel-list');
  const fuelItem = document.createElement('div');
  fuelItem.className = 'fuel-item';
  fuelItem.id = `fuel-item-${fuelCount}`;

  const fuelSelect = document.createElement('select');
  fuelSelect.id = `fuel-select-${fuelCount}`;
  fuelData.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `${fuel.Name} (${fuel.Type})`;
    fuelSelect.appendChild(option);
  });

  const percentageInput = document.createElement('input');
  percentageInput.type = 'number';
  percentageInput.id = `fuel-percentage-${fuelCount}`;
  percentageInput.placeholder = 'Percentage (%)';
  percentageInput.min = 0;
  percentageInput.max = 100;

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.onclick = () => fuelItem.remove();

  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
}

// Calculate button event listener
document.getElementById('calculate-button').addEventListener('click', calculateCombustion);

// Main calculation function
function calculateCombustion() {
  // Get fuel mixture
  const mixture = [];
  let totalPercentage = 0;
  for (let i = 0; i < fuelCount; i++) {
    const fuelItem = document.getElementById(`fuel-item-${i}`);
    if (fuelItem) {
      const fuelSelect = document.getElementById(`fuel-select-${i}`);
      const percentageInput = document.getElementById(`fuel-percentage-${i}`);
      const fuelIndex = parseInt(fuelSelect.value);
      const percentage = parseFloat(percentageInput.value);
      if (isNaN(percentage) || percentage <= 0) {
        alert('Please enter a valid percentage for all fuels.');
        return;
      }
      totalPercentage += percentage;
      mixture.push({ fuel: fuelData[fuelIndex], percentage: percentage });
    }
  }

  if (Math.abs(totalPercentage - 100) > 0.01) {
    alert('Total percentage of fuels must add up to 100%.');
    return;
  }

  // Get combustion variables
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const gasFlowRate = parseFloat(document.getElementById('gas-flow-rate').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperature = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  if (
    isNaN(temperatureC) || isNaN(pressureBar) || isNaN(gasFlowRate) ||
    isNaN(excessAirPercentage) || isNaN(flueGasTemperature) || isNaN(referenceO2)
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Perform calculations
  const results = performCalculations(
    mixture, temperatureC, pressureBar, gasFlowRate, excessAirPercentage, flueGasTemperature, referenceO2
  );

  if (results) {
    // Display results
    displayResults(results);
  }
}

// Calculation logic
function performCalculations(mixture, temperatureC, pressureBar, gasFlowRateM3h, excessAirPercentage, flueGasTemperatureC, referenceO2) {
  // Constants
  const R = 8.314; // J/(mol·K)

  // Compute overall fuel properties
  let totalMolarMass = 0;
  let totalC = 0;
  let totalH = 0;
  let totalO = 0;
  let totalN = 0;
  let totalS = 0;
  let totalHeatingValue = 0; // MJ/kg

  mixture.forEach(component => {
    const fuel = component.fuel;
    const weightFraction = component.percentage / 100;
    const molarMass = fuel.MolarMass;
    totalMolarMass += weightFraction * molarMass;
    totalC += weightFraction * (fuel.C || 0) * molarMass;
    totalH += weightFraction * (fuel.H || 0) * molarMass;
    totalO += weightFraction * (fuel.O || 0) * molarMass;
    totalN += weightFraction * (fuel.N || 0) * molarMass;
    totalS += weightFraction * (fuel.S || 0) * molarMass;
    totalHeatingValue += weightFraction * (fuel.HeatingValue || 0) * 1000; // Convert MJ/kg to kJ/kg
  });

  // Convert total elements to moles per mole of mixture
  const overallC = totalC / totalMolarMass;
  const overallH = totalH / totalMolarMass;
  const overallO = totalO / totalMolarMass;
  const overallN = totalN / totalMolarMass;
  const overallS = totalS / totalMolarMass;

  // Temperature and pressure conversions
  const temperatureK = temperatureC + 273.15;
  const pressurePa = pressureBar * 1e5;

  // Gas flow rate conversion
  const gasFlowRateM3s = gasFlowRateM3h / 3600;

  // Molar flow rate of fuel gas (mol/s)
  const nFuel = (pressurePa * gasFlowRateM3s) / (R * temperatureK);

  // Oxygen required for complete combustion per mole of fuel
  const O2RequiredPerMolFuel = overallC + overallH / 4 + overallS - overallO / 2;

  if (O2RequiredPerMolFuel <= 0) {
    alert('Invalid fuel composition leading to non-positive oxygen requirement.');
    return null;
  }

  // Air required per mole of fuel (using precise O2 content in air)
  const O2FractionInAir = 0.2095; // More precise value
  const N2O2MolarRatio = 3.76; // Moles of N2 per mole of O2 in air
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
  const nC = overallC * nFuelCombusted;
  const nH = overallH * nFuelCombusted;
  const nS = overallS * nFuelCombusted;
  const nNFuel = overallN * nFuelCombusted;

  // Products from combustion
  const nCO2 = nC; // All combusted carbon forms CO2
  const nH2O = nH / 2; // H2 forms H2O
  const nSO2 = nS; // Sulfur forms SO2
  const nCO = overallC * nUnburnedFuel; // Unburned carbon forms CO
  const nUnburnedH2 = (overallH * nUnburnedFuel) / 2; // Unburned hydrogen

  // Oxygen consumed
  const nO2Consumed = nFuelCombusted * O2RequiredPerMolFuel;
  const nO2Supplied = nAir * O2FractionInAir;
  let nO2Excess = nO2Supplied - nO2Consumed;
  if (nO2Excess < 0) nO2Excess = 0;

  // Nitrogen in flue gas
  let nN2 = nN2Air + nNFuel;

  // Simplified NOx estimation using empirical correlation
  const flameTemperatureK = calculateFlameTemperature(temperatureK, nFuelCombusted, nAir, totalHeatingValue, excessAirFraction);
  const NOx_ppm = estimateNOx(flameTemperatureK, excessAirFraction);
  const nNOx = nN2 * NOx_ppm / 1e6; // Convert ppm to molar flow rate
  nN2 -= nNOx; // Adjust N2 after NOx formation

  // SOx emissions
  const SOx_ppm = nSO2 / (nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nNOx) * 1e6; // ppm

  // Total moles of products (wet basis)
  const totalMolesWet = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nNOx;

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
    NOx_corrected_O2_actual
  };
}

// Function to calculate flame temperature (simplified)
function calculateFlameTemperature(T_initial, nFuelCombusted, nAir, totalHeatingValue, excessAirFraction) {
  // Simplified calculation assuming constant specific heat capacity
  // Cp of flue gas (approximate): 1.1 kJ/(kg·K)
  const Cp_flue_gas = 1.1; // kJ/(kg·K)
  const massFlowFlueGas = (nFuelCombusted + nAir) * 29; // Approximate molar mass in g/mol
  const massFlowFlueGasKg = massFlowFlueGas / 1000; // Convert to kg/s
  const heatReleased = nFuelCombusted * (totalHeatingValue / totalMolarMass) * 1000; // Convert to kJ/s

  const deltaT = heatReleased / (massFlowFlueGasKg * Cp_flue_gas);

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

// Display results
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
Molar Flow Rate of Fuel Gas: ${results.nFuel.toFixed(4)} mol/s
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s
Required Air Flow Rate: ${results.airFlowRateM3h.toFixed(2)} m³/h
Combustion Efficiency: ${results.combustionEfficiency.toFixed(2)}%
Flame Temperature: ${(results.flameTemperatureK - 273.15).toFixed(2)} °C

=== Combustion Products ===
Molar flow rates (mol/s):
CO2: ${results.nCO2.toExponential(4)} mol/s
H2O: ${results.nH2O.toExponential(4)} mol/s
SO2: ${results.nSO2.toExponential(4)} mol/s
CO: ${results.nCO.toExponential(4)} mol/s
H2: ${results.nUnburnedH2.toExponential(4)} mol/s
O2: ${results.nO2Excess.toExponential(4)} mol/s
N2: ${results.nN2.toExponential(4)} mol/s
NOx: ${results.nNOx.toExponential(4)} mol/s

SOx Emissions: ${results.SOx_ppm.toFixed(2)} ppm

=== Volume Percentages (Wet Basis) ===
CO2: ${results.volumePercentagesWet.CO2.toFixed(2)}%
H2O: ${results.volumePercentagesWet.H2O.toFixed(2)}%
SO2: ${results.volumePercentagesWet.SO2.toFixed(2)}%
CO: ${results.volumePercentagesWet.CO.toFixed(2)}%
H2: ${results.volumePercentagesWet.H2.toFixed(2)}%
O2: ${results.volumePercentagesWet.O2.toFixed(2)}%
N2: ${results.volumePercentagesWet.N2.toFixed(2)}%
NOx: ${results.volumePercentagesWet.NOx.toFixed(2)}%

=== Volume Percentages (Dry Basis) ===
CO2: ${results.volumePercentagesDry.CO2.toFixed(2)}%
SO2: ${results.volumePercentagesDry.SO2.toFixed(2)}%
CO: ${results.volumePercentagesDry.CO.toFixed(2)}%
H2: ${results.volumePercentagesDry.H2.toFixed(2)}%
O2: ${results.volumePercentagesDry.O2.toFixed(2)}%
N2: ${results.volumePercentagesDry.N2.toFixed(2)}%
NOx: ${results.volumePercentagesDry.NOx.toFixed(2)}%

=== Advanced NOₓ Calculations ===
NOₓ (ppm): ${results.NOx_ppm.toFixed(2)} ppm
NOₓ_normalized (mg/Nm³): ${results.NOx_normalized.toFixed(2)}
NOₓ_flue_gas_temp (mg/Am³): ${results.NOx_flue_gas_temp.toFixed(2)}
NOₓ_corrected_O₂_normalized (mg/Nm³): ${results.NOx_corrected_O2_normalized.toFixed(2)}
NOₓ_corrected_O₂_actual (mg/Am³): ${results.NOx_corrected_O2_actual.toFixed(2)}
`;
}
