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
  .catch(error => {
    console.error('Error loading fuel data:', error);
    alert('Failed to load fuel data.');
  });

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
    option.text = `${fuel.Name} ${fuel.Formula} (${fuel.Type})`;
    fuelSelect.appendChild(option);
  });

  const percentageInput = document.createElement('input');
  percentageInput.type = 'number';
  percentageInput.id = `fuel-percentage-${fuelCount}`;
  percentageInput.placeholder = 'Percentage (%)';
  percentageInput.min = 0;
  percentageInput.max = 100;
  percentageInput.step = 'any';

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.type = 'button';
  removeButton.onclick = () => {
    fuelItem.remove();
    updateFlowRateLabel();
  };

  // Event listener to update flow rate label when fuel type changes
  fuelSelect.addEventListener('change', updateFlowRateLabel);

  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;

  // Update flow rate label in case a solid fuel is added
  updateFlowRateLabel();
}

// Update flow rate label based on fuel types selected
function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  let containsSolidFuel = false;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    if (fuelSelect) {
      const fuelIndex = parseInt(fuelSelect.value);
      const fuel = fuelData[fuelIndex];
      if (fuel.Type === 'Solid') {
        containsSolidFuel = true;
        break;
      }
    }
  }

  if (containsSolidFuel) {
    flowRateLabel.textContent = 'Fuel Mass Flow Rate (kg/h):';
    fuelFlowRateInput.placeholder = 'Mass Flow Rate (kg/h)';
  } else {
    flowRateLabel.textContent = 'Fuel Volumetric Flow Rate (m³/h):';
    fuelFlowRateInput.placeholder = 'Volumetric Flow Rate (m³/h)';
  }
}

// Calculate button event listener
document.getElementById('calculate-button').addEventListener('click', calculateCombustion);

// Main calculation function
function calculateCombustion() {
  // Get fuel mixture
  let mixture = [];
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

  // Check if mixture contains solid fuel
  let containsSolidFuel = mixture.some(component => component.fuel.Type === 'Solid');

  // Get combustion variables
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperature = parseFloat(document.getElementById('flue-gas-temperature').value);
  const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  if (
    isNaN(temperatureC) || isNaN(pressureBar) ||
    isNaN(excessAirPercentage) || isNaN(flueGasTemperature) ||
    isNaN(inletAirTemperatureC) || isNaN(referenceO2)
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Get fuel flow rate
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  if (isNaN(fuelFlowRate) || fuelFlowRate <= 0) {
    alert('Please enter a valid fuel flow rate.');
    return;
  }

  // Determine if flow rate is mass or volumetric
  const isMassFlowRate = containsSolidFuel;

  // Disable the Calculate button
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.disabled = true;
  calculateButton.textContent = 'Calculating...';

  // Initialize the worker and start calculations
  initWorker(
    mixture,
    temperatureC,
    pressureBar,
    fuelFlowRate,
    isMassFlowRate,
    excessAirPercentage,
    flueGasTemperature,
    inletAirTemperatureC,
    referenceO2
  );
}

// Initialize Web Worker
function initWorker(
  mixture,
  temperatureC,
  pressureBar,
  fuelFlowRate,
  isMassFlowRate,
  excessAirPercentage,
  flueGasTemperature,
  inletAirTemperatureC,
  referenceO2
) {
  if (typeof worker === 'undefined') {
    worker = new Worker('worker.js');

    worker.onmessage = function(e) {
      const results = e.data;

      if (results.error) {
        alert('An error occurred during calculations: ' + results.error);
        console.error('Calculation error:', results.error);
        document.getElementById('calculate-button').disabled = false;
        document.getElementById('calculate-button').textContent = 'Calculate';
        return;
      }

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

  // Post data to the worker
  worker.postMessage({
    mixture,
    temperatureC,
    pressureBar,
    fuelFlowRate,
    isMassFlowRate,
    excessAirPercentage,
    flueGasTemperatureC: flueGasTemperature,
    inletAirTemperatureC,
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

Molar Flow Rate of Fuel: ${results.nFuel.toFixed(4)} mol/s
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s
Required Air Flow Rate: ${results.airFlowRate.toFixed(2)} ${results.flowRateUnit}
Combustion Efficiency: ${results.combustionEfficiency.toFixed(2)}%
Flame Temperature: ${(results.flameTemperatureK - 273.15).toFixed(2)} °C
Fuel Gas Density: ${results.fuelGasDensity.toFixed(4)} kg/m³

=== Combustion Products ===
Molar flow rates (mol/s):
CO2: ${results.nCO2.toExponential(4)} mol/s
H2O: ${results.nH2O.toExponential(4)} mol/s
SO2: ${results.nSO2.toExponential(4)} mol/s
H2: ${results.nUnburnedH2.toExponential(4)} mol/s
O2: ${results.nO2Excess.toExponential(4)} mol/s
N2: ${results.nN2.toExponential(4)} mol/s
NOx: ${results.nNOx.toExponential(4)} mol/s
Ash: ${results.nAsh.toExponential(4)} mol/s

SOx Emissions: ${results.SOx_ppm.toFixed(2)} ppm

=== Volume Percentages (Wet Basis) ===
CO2: ${results.volumePercentagesWet.CO2.toFixed(2)}%
H2O: ${results.volumePercentagesWet.H2O.toFixed(2)}%
SO2: ${results.volumePercentagesWet.SO2.toFixed(2)}%
H2: ${results.volumePercentagesWet.H2.toFixed(2)}%
O2: ${results.volumePercentagesWet.O2.toFixed(2)}%
N2: ${results.volumePercentagesWet.N2.toFixed(2)}%
NOx: ${results.volumePercentagesWet.NOx.toFixed(2)}%
Ash: ${results.volumePercentagesWet.Ash.toFixed(2)}%

=== Volume Percentages (Dry Basis) ===
CO2: ${results.volumePercentagesDry.CO2.toFixed(2)}%
SO2: ${results.volumePercentagesDry.SO2.toFixed(2)}%
H2: ${results.volumePercentagesDry.H2.toFixed(2)}%
O2: ${results.volumePercentagesDry.O2.toFixed(2)}%
N2: ${results.volumePercentagesDry.N2.toFixed(2)}%
NOx: ${results.volumePercentagesDry.NOx.toFixed(2)}%
Ash: ${results.volumePercentagesDry.Ash.toFixed(2)}%

=== Advanced NOₓ Calculations ===
NOₓ (ppm): ${results.NOx_ppm.toFixed(2)} ppm
NOₓ_normalized (mg/Nm³): ${results.NOx_normalized.toFixed(2)}
NOₓ_flue_gas_temp (mg/Am³): ${results.NOx_flue_gas_temp.toFixed(2)}
NOₓ_corrected_O₂_normalized (mg/Nm³): ${results.NOx_corrected_O2_normalized.toFixed(2)}
NOₓ_corrected_O₂_actual (mg/Am³): ${results.NOx_corrected_O2_actual.toFixed(2)}

=== CO Calculations ===
CO (ppm): ${results.CO_ppm.toFixed(2)} ppm

=== Notes ===
- CO ppm represents carbon monoxide emissions from incomplete combustion.
- Other sources of CO (e.g., boiler walls) are not accounted for in this calculator.
- Ensure proper maintenance and operation of combustion systems to minimize CO emissions.
  `;
}
