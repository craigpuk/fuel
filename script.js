// script.js

// Global variables
let fuelData = [];
let fuelCount = 0;
let worker;

// Fetch fuel data from JSON file
fetch('fuel_data.json')
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    fuelData = data;
    initializeFuelSelection();
  })
  .catch(error => {
    console.error('Error loading fuel data:', error);
    alert('Failed to load fuel data. Please ensure fuel_data.json is correctly placed and formatted.');
  });

// Initialize fuel selection interface
function initializeFuelSelection() {
  document.getElementById('add-fuel-button').addEventListener('click', addFuel);
  addFuel(); // Add the first fuel selection by default
}

// Add a new fuel selection row
function addFuel() {
  const fuelList = document.getElementById('fuel-list');
  const fuelItem = document.createElement('div');
  fuelItem.className = 'fuel-item';
  fuelItem.id = `fuel-item-${fuelCount}`;

  // Create fuel dropdown
  const fuelSelect = document.createElement('select');
  fuelSelect.id = `fuel-select-${fuelCount}`;
  fuelSelect.required = true;

  // Populate dropdown with fuel options
  fuelData.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `${fuel.Name} (${fuel.Formula}) - ${fuel.Type}`;
    fuelSelect.appendChild(option);
  });

  // Create percentage input
  const percentageInput = document.createElement('input');
  percentageInput.type = 'number';
  percentageInput.id = `fuel-percentage-${fuelCount}`;
  percentageInput.placeholder = 'Percentage (%)';
  percentageInput.min = 0;
  percentageInput.max = 100;
  percentageInput.step = 'any';
  percentageInput.required = true;

  // Create remove button
  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.type = 'button';
  removeButton.className = 'remove-fuel-button';
  removeButton.onclick = () => {
    fuelItem.remove();
    updateFlowRateLabel();
  };

  // Append elements to fuelItem
  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
  updateFlowRateLabel();
}

// Update flow rate label based on selected fuel types
function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  let containsSolidFuel = false;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    if (fuelSelect) {
      const fuelIndex = parseInt(fuelSelect.value);
      const fuel = fuelData[fuelIndex];
      if (fuel.Type.toLowerCase() === 'solid') {
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
  // Gather fuel mixture data
  let mixture = [];
  let totalPercentage = 0;
  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    const percentageInput = document.getElementById(`fuel-percentage-${i}`);
    if (fuelSelect && percentageInput) {
      const fuelIndex = parseInt(fuelSelect.value);
      const percentage = parseFloat(percentageInput.value);
      if (isNaN(fuelIndex) || isNaN(percentage) || percentage <= 0) {
        alert('Please enter valid fuel selections and percentages.');
        return;
      }
      totalPercentage += percentage;
      mixture.push({ fuel: fuelData[fuelIndex], percentage: percentage });
    }
  }

  // Validate total percentage
  if (Math.abs(totalPercentage - 100) > 0.01) {
    alert('Total percentage of fuels must add up to 100%. Currently, it is ' + totalPercentage.toFixed(2) + '%.');
    return;
  }

  // Gather combustion variables
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperatureC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);

  // Validate combustion variables
  if (
    isNaN(temperatureC) || isNaN(pressureBar) ||
    isNaN(excessAirPercentage) || isNaN(flueGasTemperatureC) ||
    isNaN(inletAirTemperatureC) || isNaN(referenceO2) ||
    isNaN(fuelFlowRate) || fuelFlowRate <= 0
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Determine if flow rate is mass or volumetric based on fuel types
  const containsSolidFuel = mixture.some(component => component.fuel.Type.toLowerCase() === 'solid');

  // Disable the Calculate button to prevent multiple clicks
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.disabled = true;
  calculateButton.textContent = 'Calculating...';

  // Initialize and communicate with the Web Worker
  initWorker(
    mixture,
    temperatureC,
    pressureBar,
    fuelFlowRate,
    containsSolidFuel,
    excessAirPercentage,
    flueGasTemperatureC,
    inletAirTemperatureC,
    referenceO2
  );
}

// Initialize Web Worker and handle communication
function initWorker(
  mixture,
  temperatureC,
  pressureBar,
  fuelFlowRate,
  isMassFlowRate,
  excessAirPercentage,
  flueGasTemperatureC,
  inletAirTemperatureC,
  referenceO2
) {
  if (!worker) {
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
      document.getElementById('calculate-button').disabled = false;
      document.getElementById('calculate-button').textContent = 'Calculate';
    };

    worker.onerror = function(error) {
      alert('An unexpected error occurred during calculations.');
      console.error('Worker error:', error);
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
    flueGasTemperatureC,
    inletAirTemperatureC,
    referenceO2
  });
}

// Display results in the output section
function displayResults(results) {
  const output = document.getElementById('output');
  output.innerHTML = `
    <h3>Combustion Results</h3>
    <p><strong>Fuel Mixture Properties:</strong></p>
    <ul>
      <li>Average Molar Mass: ${results.totalMolarMass.toFixed(2)} g/mol</li>
      <li>Lower Heating Value (LHV): ${results.totalLHV.toFixed(2)} MJ/kg</li>
      <li>Higher Heating Value (HHV): ${results.totalHHV.toFixed(2)} MJ/kg</li>
    </ul>

    <p><strong>Flow Rates:</strong></p>
    <ul>
      <li>Molar Flow Rate of Fuel: ${results.nFuel.toFixed(4)} mol/s</li>
      <li>Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s</li>
      <li>Air Flow Rate: ${results.airFlowRateM3h.toFixed(2)} m³/h</li>
    </ul>

    <p><strong>Combustion Efficiency:</strong></p>
    <ul>
      <li>True Combustion Efficiency: ${results.trueCombustionEfficiency.toFixed(2)}%</li>
    </ul>

    <p><strong>Combustion Products:</strong></p>
    <ul>
      <li>CO₂: ${results.nCO2.toFixed(4)} mol/s</li>
      <li>H₂O: ${results.nH2O.toFixed(4)} mol/s</li>
      <li>SO₂: ${results.nSO2.toFixed(4)} mol/s</li>
      <li>Excess O₂: ${results.nO2Excess.toFixed(4)} mol/s</li>
      <li>N₂: ${results.nN2.toFixed(4)} mol/s</li>
    </ul>

    <p><strong>Additional Information:</strong></p>
    <ul>
      <li>Fuel Gas Density: ${results.fuelGasDensity.toFixed(4)} kg/m³</li>
      <li>Flame Temperature: ${(results.flameTemperatureK - 273.15).toFixed(2)} °C</li>
      <li>NOₓ Emissions: ${results.NOx_ppm.toFixed(2)} ppm</li>
      <li>SOₓ Emissions: ${results.SOx_ppm.toFixed(2)} ppm</li>
      <li>CO Emissions: ${results.CO_ppm.toFixed(2)} ppm</li>
    </ul>

    <p><strong>Volume Percentages (Wet Basis):</strong></p>
    <ul>
      <li>CO₂: ${results.volumePercentagesWet.CO2.toFixed(2)}%</li>
      <li>H₂O: ${results.volumePercentagesWet.H2O.toFixed(2)}%</li>
      <li>SO₂: ${results.volumePercentagesWet.SO2.toFixed(2)}%</li>
      <li>H₂: ${results.volumePercentagesWet.H2.toFixed(2)}%</li>
      <li>O₂: ${results.volumePercentagesWet.O2.toFixed(2)}%</li>
      <li>N₂: ${results.volumePercentagesWet.N2.toFixed(2)}%</li>
      <li>NOₓ: ${results.volumePercentagesWet.NOx.toFixed(2)}%</li>
      <li>Ash: ${results.volumePercentagesWet.Ash.toFixed(2)}%</li>
    </ul>

    <p><strong>Volume Percentages (Dry Basis):</strong></p>
    <ul>
      <li>CO₂: ${results.volumePercentagesDry.CO2.toFixed(2)}%</li>
      <li>SO₂: ${results.volumePercentagesDry.SO2.toFixed(2)}%</li>
      <li>H₂: ${results.volumePercentagesDry.H2.toFixed(2)}%</li>
      <li>O₂: ${results.volumePercentagesDry.O2.toFixed(2)}%</li>
      <li>N₂: ${results.volumePercentagesDry.N2.toFixed(2)}%</li>
      <li>NOₓ: ${results.volumePercentagesDry.NOx.toFixed(2)}%</li>
      <li>Ash: ${results.volumePercentagesDry.Ash.toFixed(2)}%</li>
    </ul>

    <p><strong>Advanced NOₓ Calculations:</strong></p>
    <ul>
      <li>NOₓ (ppm): ${results.NOx_ppm.toFixed(2)} ppm</li>
      <li>NOₓ_normalized (mg/Nm³): ${results.NOx_normalized.toFixed(2)} mg/Nm³</li>
      <li>NOₓ_flue_gas_temp (mg/Am³): ${results.NOx_flue_gas_temp.toFixed(2)} mg/Am³</li>
      <li>NOₓ_corrected_O₂_normalized (mg/Nm³): ${results.NOx_corrected_O2_normalized.toFixed(2)} mg/Nm³</li>
      <li>NOₓ_corrected_O₂_actual (mg/Am³): ${results.NOx_corrected_O2_actual.toFixed(2)} mg/Am³</li>
    </ul>

    <p><strong>CO Calculations:</strong></p>
    <ul>
      <li>CO (ppm): ${results.CO_ppm.toFixed(2)} ppm</li>
    </ul>

    <p><strong>Notes:</strong></p>
    <ul>
      <li>CO ppm represents carbon monoxide emissions from incomplete combustion.</li>
      <li>Other sources of CO (e.g., boiler walls) are not accounted for in this calculator.</li>
      <li>Ensure proper maintenance and operation of combustion systems to minimize CO emissions.</li>
    </ul>
  `;
}
