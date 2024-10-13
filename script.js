// script.js

let fuelData = [];
let fuelCount = 0;
let customFuels = [];
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
  document.getElementById('add-custom-fuel-button').addEventListener('click', openCustomFuelModal);
  document.getElementById('save-custom-fuel').addEventListener('click', saveCustomFuel);
  document.getElementById('cancel-custom-fuel').addEventListener('click', closeCustomFuelModal);
  document.getElementById('calculate-button').addEventListener('click', calculateCombustion);
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

  // Populate select options with available fuels and custom fuels
  [...fuelData, ...customFuels].forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `${fuel.Name} (${fuel.Symbol || fuel.Type})`;
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
  removeButton.onclick = () => {
    fuelItem.remove();
  };

  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
}

// Open custom fuel modal
function openCustomFuelModal() {
  document.getElementById('custom-fuel-modal').style.display = 'block';
}

// Close custom fuel modal
function closeCustomFuelModal() {
  document.getElementById('custom-fuel-modal').style.display = 'none';
}

// Save custom fuel
function saveCustomFuel() {
  const customFuel = {
    Name: document.getElementById('custom-fuel-name').value,
    Type: document.getElementById('custom-fuel-type').value,
    MolarMass: parseFloat(document.getElementById('custom-fuel-molar-mass').value),
    C: parseFloat(document.getElementById('custom-fuel-C').value),
    H: parseFloat(document.getElementById('custom-fuel-H').value),
    O: parseFloat(document.getElementById('custom-fuel-O').value),
    N: parseFloat(document.getElementById('custom-fuel-N').value),
    S: parseFloat(document.getElementById('custom-fuel-S').value),
    HeatingValue: parseFloat(document.getElementById('custom-fuel-LHV').value),
    HHV: parseFloat(document.getElementById('custom-fuel-HHV').value)
  };

  customFuels.push(customFuel);
  closeCustomFuelModal();
  addFuel();
}

// Toggle the visibility of O₂ and CO₂ input fields based on checkbox
function toggleCombustionPoints() {
  const isCostCalculationEnabled = document.getElementById('enable-cost-calculation').checked;
  const combustionPointsSection = document.getElementById('combustion-points');
  
  if (isCostCalculationEnabled) {
    combustionPointsSection.style.display = 'block';
  } else {
    combustionPointsSection.style.display = 'none';
  }
}

// Main function to start the calculation
function calculateCombustion() {
  const mixture = [];
  let totalPercentage = 0;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    const percentageInput = document.getElementById(`fuel-percentage-${i}`);
    const fuelIndex = parseInt(fuelSelect.value);
    const percentage = parseFloat(percentageInput.value);

    if (isNaN(percentage) || percentage <= 0) {
      alert('Please enter valid percentages for all fuels.');
      return;
    }

    totalPercentage += percentage;
    mixture.push({ fuel: [...fuelData, ...customFuels][fuelIndex], percentage });
  }

  if (totalPercentage !== 100) {
    alert('Total percentage must equal 100%.');
    return;
  }

  // Get input values
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperatureC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  const isCostCalculationEnabled = document.getElementById('enable-cost-calculation').checked;
  const fuelCost = isCostCalculationEnabled ? parseFloat(document.getElementById('fuel-cost').value) : null;

  const minFlowRate = parseFloat(document.getElementById('min-flow-rate').value);
  const maxFlowRate = parseFloat(document.getElementById('max-flow-rate').value);
  const combustionPoints = [];

  if (isCostCalculationEnabled) {
    for (let i = 0; i < 10; i++) {
      const o2 = parseFloat(document.getElementById(`o2-${i}`).value);
      const co2 = parseFloat(document.getElementById(`co2-${i}`).value);
      const flowRate = minFlowRate + (maxFlowRate - minFlowRate) * (i / 9);

      if (isNaN(o2) || isNaN(co2)) {
        alert(`Please enter valid O₂ and CO₂ values for all 10 points.`);
        return;
      }

      combustionPoints.push({ o2, co2, flowRate });
    }
  }

  if (typeof worker === 'undefined') {
    worker = new Worker('worker.js');

    // Handle results from worker
    worker.onmessage = function(e) {
      const results = e.data;

      if (results.error) {
        alert('Error during calculations: ' + results.error);
        console.error('Calculation error:', results.error);
        return;
      }

      displayResults(results);
    };

    worker.onerror = function(error) {
      console.error('Worker error:', error);
      alert('An error occurred during the calculations.');
    };
  }

  // Send data to worker for calculation
  worker.postMessage({
    mixture,
    temperatureC,
    inletAirTemperatureC,
    pressureBar,
    fuelFlowRate,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2,
    isCostCalculationEnabled,
    fuelCost,
    minFlowRate,
    maxFlowRate,
    combustionPoints
  });
}

// Display results from the worker
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
CO2: ${results.wetBasis.CO2.toFixed(4)} mol/s
H2O: ${results.wetBasis.H2O.toFixed(4)} mol/s
O2: ${results.wetBasis.O2.toFixed(4)} mol/s
N2: ${results.wetBasis.N2.toFixed(4)} mol/s

=== Volume Percentages (Wet Basis) ===
CO2: ${results.wetBasis.CO2.toFixed(2)}%
H2O: ${results.wetBasis.H2O.toFixed(2)}%
O2: ${results.wetBasis.O2.toFixed(2)}%
N2: ${results.wetBasis.N2.toFixed(2)}%

=== Volume Percentages (Dry Basis) ===
CO2: ${results.dryBasis.CO2.toFixed(2)}%
O2: ${results.dryBasis.O2.toFixed(2)}%
N2: ${results.dryBasis.N2.toFixed(2)}%

=== NOₓ Calculations ===
NOₓ (ppm): ${results.NOx_ppm.toFixed(2)} ppm
`;

  if (results.costAnalysis) {
    output.textContent += `\n=== Cost Analysis ===\n${results.costAnalysis}`;
  }
}
