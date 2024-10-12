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

  if (totalPercentage !== 100) {
    alert('Total percentage of fuels must add up to 100%.');
    return;
  }

  // Get combustion variables
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const gasFlowRate = parseFloat(document.getElementById('gas-flow-rate').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const combustionEfficiency = parseFloat(document.getElementById('combustion-efficiency').value);

  if (
    isNaN(temperatureC) || isNaN(pressureBar) || isNaN(gasFlowRate) ||
    isNaN(excessAirPercentage) || isNaN(combustionEfficiency)
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Perform calculations
  const results = performCalculations(
    mixture, temperatureC, pressureBar, gasFlowRate, excessAirPercentage, combustionEfficiency
  );

  if (results) {
    // Display results
    displayResults(results);
  }
}

// Calculation logic
function performCalculations(mixture, temperatureC, pressureBar, gasFlowRateM3h, excessAirPercentage, combustionEfficiency) {
  // Constants
  const R = 8.314; // J/(mol·K)

  // Compute overall fuel properties
  let totalMolarMass = 0;
  let totalC = 0;
  let totalH = 0;
  let totalO = 0;
  let totalN = 0;
  let totalS = 0;

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

  // Combustion efficiency
  const combustionEfficiencyFraction = combustionEfficiency / 100;
  const nFuelCombusted = nFuel * combustionEfficiencyFraction;
  const nUnburnedFuel = nFuel - nFuelCombusted;

  // Oxygen required for complete combustion
  const O2RequiredPerMolFuel = overallC + overallH / 4 + overallS - overallO / 2;

  if (O2RequiredPerMolFuel <= 0) {
    alert('Invalid fuel composition leading to non-positive oxygen requirement.');
    return null;
  }

  // Air required per mole of fuel
  const airRequiredPerMolFuel = O2RequiredPerMolFuel / 0.21;

  // Molar flow rate of air required (mol/s)
  const excessAirFraction = excessAirPercentage / 100;
  const nAir = nFuelCombusted * airRequiredPerMolFuel * (1 + excessAirFraction);

  // Air flow rate (m³/h)
  const airFlowRateM3s = (nAir * R * temperatureK) / pressurePa;
  const airFlowRateM3h = airFlowRateM3s * 3600;

  // Total N2 from air
  const nN2Air = nAir * 0.79;

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
  const nO2Supplied = nAir * 0.21;
  let nO2Excess = nO2Supplied - nO2Consumed;
  if (nO2Excess < 0) nO2Excess = 0;

  // Nitrogen in flue gas
  let nN2 = nN2Air + nNFuel;

  // Simplified NOx estimation (e.g., 100 ppm)
  const nNOx = nN2 * 1e-4; // 100 ppm NOx formation
  nN2 -= nNOx; // Adjust N2 after NOx formation

  // Total moles of products
  const totalMoles = nCO2 + nH2O + nSO2 + nCO + nUnburnedH2 + nO2Excess + nN2 + nNOx;

  // Volume percentages
  const volumePercentages = {
    CO2: (nCO2 / totalMoles) * 100,
    H2O: (nH2O / totalMoles) * 100,
    SO2: (nSO2 / totalMoles) * 100,
    CO: (nCO / totalMoles) * 100,
    H2: (nUnburnedH2 / totalMoles) * 100,
    O2: (nO2Excess / totalMoles) * 100,
    N2: (nN2 / totalMoles) * 100,
    NOx: (nNOx / totalMoles) * 100
  };

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
    volumePercentages
  };
}

// Display results
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
Molar Flow Rate of Fuel Gas: ${results.nFuel.toFixed(4)} mol/s
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s
Required Air Flow Rate: ${results.airFlowRateM3h.toFixed(2)} m³/h

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

Volume Percentages of Combustion Products:
CO2: ${results.volumePercentages.CO2.toFixed(2)}%
H2O: ${results.volumePercentages.H2O.toFixed(2)}%
SO2: ${results.volumePercentages.SO2.toFixed(2)}%
CO: ${results.volumePercentages.CO.toFixed(2)}%
H2: ${results.volumePercentages.H2.toFixed(2)}%
O2: ${results.volumePercentages.O2.toFixed(2)}%
N2: ${results.volumePercentages.N2.toFixed(2)}%
NOx: ${results.volumePercentages.NOx.toFixed(2)}%
`;
}
