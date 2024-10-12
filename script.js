// script.js

// Global variables
let fuelData = [];
let fuelCount = 0;
let worker;

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

  // Initialize Web Worker
  if (typeof worker === 'undefined') {
    worker = new Worker('worker.js');
    worker.onmessage = function(e) {
      const results = e.data;
      displayResults(results);

      // Re-enable the Calculate button
      document.getElementById('calculate-button').disabled = false;
      document.getElementById('calculate-button').textContent = 'Calculate';
    };
    worker.onerror = function(error) {
      console.error('Worker error:', error);
      alert('An error occurred during calculations.');
      document.getElementById('calculate-button').disabled = false;
      document.getElementById('calculate-button').textContent = 'Calculate';
    };
  }

  // Disable the Calculate button to prevent multiple clicks
  document.getElementById('calculate-button').disabled = true;
  document.getElementById('calculate-button').textContent = 'Calculating...';

  // Send data to the worker
  worker.postMessage({
    mixture,
    temperatureC,
    pressureBar,
    gasFlowRateM3h: gasFlowRate,
    excessAirPercentage,
    flueGasTemperatureC: flueGasTemperature,
    referenceO2
  });
}

// Display results
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
Average Molar Weight of Fuel Mixture: ${results.totalMolarMass.toFixed(2)} g/mol
Lower Heating Value (LHV): ${results.totalLHV.toFixed(2)} MJ/kg
Higher Heating Value (HHV): ${results.totalHHV.toFixed(2)} MJ/kg

Molar Flow Rate of Fuel Gas: ${results.nFuel.toFixed(4)} mol/s
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s
Required Air Flow Rate: ${results.airFlowRateM3h.toFixed(2)} m³/h
Combustion Efficiency: ${results.combustionEfficiency.toFixed(2)}%
Flame Temperature: ${(results.flameTemperatureK - 273.15).toFixed(2)} °C
Gas Density: ${results.gasDensity.toFixed(4)} kg/m³

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
