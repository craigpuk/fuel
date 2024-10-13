// script.js

// Global variables
let fuelData = [];
let fuelCount = 0;
let customFuels = [];
let worker;

// Fetch predefined fuels from fuel_data.json
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

// Initialize the fuel selection UI
function initializeFuelSelection() {
  document.getElementById('add-fuel-button').addEventListener('click', addFuel);
  document.getElementById('create-custom-fuel-button').addEventListener('click', showCustomFuelForm);
  document.getElementById('close-custom-fuel').addEventListener('click', hideCustomFuelForm);
  document.getElementById('cancel-custom-fuel-button').addEventListener('click', hideCustomFuelForm);
  document.getElementById('custom-fuel-form-element').addEventListener('submit', saveCustomFuel);
  document.getElementById('enable-cost-calculation').addEventListener('change', toggleCostInputs);
  addFuel(); // Add the first fuel selection
}

// Function to add a new fuel selection row
function addFuel() {
  const fuelList = document.getElementById('fuel-list');
  const fuelItem = document.createElement('div');
  fuelItem.className = 'fuel-item';
  fuelItem.id = `fuel-item-${fuelCount}`;

  const fuelSelect = document.createElement('select');
  fuelSelect.id = `fuel-select-${fuelCount}`;
  fuelSelect.required = true;
  updateFuelOptions(fuelSelect);

  const percentageInput = document.createElement('input');
  percentageInput.type = 'number';
  percentageInput.id = `fuel-percentage-${fuelCount}`;
  percentageInput.placeholder = 'Percentage (%)';
  percentageInput.min = 0;
  percentageInput.max = 100;
  percentageInput.step = '0.1';
  percentageInput.required = true;

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.type = 'button';
  removeButton.className = 'remove-fuel-button';
  removeButton.addEventListener('click', () => removeFuel(fuelItem.id));

  fuelSelect.addEventListener('change', updateFlowRateLabel);

  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
  updateFlowRateLabel();
}

// Function to update fuel options in a select element
function updateFuelOptions(selectElement) {
  selectElement.innerHTML = '';
  fuelData.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `${fuel.Name} (${fuel.Symbol})`;
    selectElement.appendChild(option);
  });
}

// Function to remove a fuel selection row
function removeFuel(fuelItemId) {
  const fuelItem = document.getElementById(fuelItemId);
  if (fuelItem) {
    fuelItem.remove();
    updateFlowRateLabel();
  }
}

// Function to show the custom fuel creation form
function showCustomFuelForm() {
  document.getElementById('custom-fuel-form').style.display = 'block';
}

// Function to hide the custom fuel creation form
function hideCustomFuelForm() {
  document.getElementById('custom-fuel-form').style.display = 'none';
  document.getElementById('custom-fuel-form-element').reset();
}

// Function to save a custom fuel
function saveCustomFuel(event) {
  event.preventDefault();

  const name = document.getElementById('custom-fuel-name').value.trim();
  const formula = document.getElementById('custom-fuel-formula').value.trim();
  const type = document.getElementById('custom-fuel-type').value;
  const molarMass = parseFloat(document.getElementById('custom-fuel-molar-mass').value);
  const heatingValue = parseFloat(document.getElementById('custom-fuel-heating-value').value);
  const hhv = parseFloat(document.getElementById('custom-fuel-hhv').value);

  if (!name || !formula || !type || isNaN(molarMass) || isNaN(heatingValue) || isNaN(hhv)) {
    alert('Please fill in all fields correctly.');
    return;
  }

  const symbol = formula.replace(/(\d+)/g, (_, num) => {
    return num.split('').map(digit => `\u208${digit}`).join('');
  });

  const newFuel = {
    "Name": name,
    "Type": type,
    "Formula": formula,
    "Symbol": symbol,
    "MolarMass": molarMass,
    "C": 0, // Default values; can be expanded based on user input
    "H": 0,
    "O": 0,
    "N": 0,
    "S": 0,
    "AshContent": 0,
    "MoistureContent": 0,
    "HeatingValue": heatingValue,
    "HHV": hhv
  };

  fuelData.push(newFuel);
  customFuels.push(newFuel);
  hideCustomFuelForm();
  addFuel();
  alert('Custom fuel added successfully!');
}

// Function to toggle cost input fields
function toggleCostInputs() {
  const costInputs = document.getElementById('cost-inputs');
  if (document.getElementById('enable-cost-calculation').checked) {
    costInputs.style.display = 'block';
    updateCostFlowRateUnit();
  } else {
    costInputs.style.display = 'none';
  }
}

// Function to update flow rate label based on fuel types selected
function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  let containsSolidFuel = false;
  let containsLiquidFuel = false;

  const fuelItems = document.querySelectorAll('.fuel-item');
  fuelItems.forEach(item => {
    const select = item.querySelector('select');
    if (select) {
      const fuelIndex = parseInt(select.value);
      const fuel = fuelData[fuelIndex];
      if (fuel.Type === 'Solid') containsSolidFuel = true;
      if (fuel.Type === 'Liquid') containsLiquidFuel = true;
    }
  });

  if (containsSolidFuel || containsLiquidFuel) {
    flowRateLabel.textContent = 'Fuel Mass Flow Rate (kg/h):';
    fuelFlowRateInput.placeholder = 'Mass Flow Rate (kg/h)';
    document.getElementById('fuel-flow-rate').dataset.unit = 'kg/h';
  } else {
    flowRateLabel.textContent = 'Fuel Volumetric Flow Rate (m³/h):';
    fuelFlowRateInput.placeholder = 'Volumetric Flow Rate (m³/h)';
    document.getElementById('fuel-flow-rate').dataset.unit = 'm³/h';
  }

  // Update cost flow rate unit if cost calculation is enabled
  if (document.getElementById('enable-cost-calculation').checked) {
    updateCostFlowRateUnit();
  }
}

// Function to update the placeholder for cost flow rate based on fuel type
function updateCostFlowRateUnit() {
  const fuelFlowRateUnit = document.getElementById('fuel-flow-rate').dataset.unit || 'm³/h';
  document.getElementById('fuel-cost').placeholder = `Enter cost per ${fuelFlowRateUnit}`;
  document.getElementById('min-flow-rate').placeholder = `Enter min flow rate (${fuelFlowRateUnit})`;
  document.getElementById('max-flow-rate').placeholder = `Enter max flow rate (${fuelFlowRateUnit})`;
}

// Event listener to update flow rate label when any fuel selection changes
document.addEventListener('change', (event) => {
  if (event.target.matches('select')) {
    updateFlowRateLabel();
  }
});

// Function to generate combustion points based on min and max flow rates
function generateCombustionPoints(minFlow, maxFlow) {
  const pointsContainer = document.getElementById('combustion-points');
  pointsContainer.innerHTML = ''; // Clear existing points

  const step = (maxFlow - minFlow) / 9; // 10 points including min and max

  for (let i = 0; i < 10; i++) {
    const flowRate = minFlow + i * step;
    const combustionPoint = document.createElement('div');
    combustionPoint.className = 'combustion-point';
    combustionPoint.innerHTML = `
      <strong>Point ${i + 1} - Flow Rate: ${flowRate.toFixed(2)} ${document.getElementById('fuel-flow-rate').dataset.unit || 'm³/h'}</strong><br>
      <label for="o2-reading-${i}">O₂ Reading (%):</label>
      <input type="number" id="o2-reading-${i}" min="0" max="20" step="0.1" required><br>
      <label for="co2-reading-${i}">CO₂ Reading (%):</label>
      <input type="number" id="co2-reading-${i}" min="0" max="20" step="0.1" required><br>
    `;
    pointsContainer.appendChild(combustionPoint);
  }
}

// Event listener for enabling fuel cost calculation
document.getElementById('enable-cost-calculation').addEventListener('change', function() {
  const costInputs = document.getElementById('cost-inputs');
  if (this.checked) {
    costInputs.style.display = 'block';
    updateCostFlowRateUnit();
  } else {
    costInputs.style.display = 'none';
  }
});

// Event listener for Calculate button
document.getElementById('calculate-button').addEventListener('click', () => {
  // Validate fuel selections
  const fuelItems = document.querySelectorAll('.fuel-item');
  let mixture = [];
  let totalPercentage = 0;

  fuelItems.forEach(item => {
    const select = item.querySelector('select');
    const percentage = parseFloat(item.querySelector('input').value);
    if (isNaN(percentage) || percentage < 0) {
      alert('Please enter valid percentages for all fuels.');
      return;
    }
    totalPercentage += percentage;
    const fuelIndex = parseInt(select.value);
    mixture.push({
      fuel: fuelData[fuelIndex],
      percentage: percentage
    });
  });

  if (totalPercentage !== 100) {
    alert('Total fuel percentages must add up to 100%.');
    return;
  }

  // Get combustion variables
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const inletAirTempC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAirPerc = parseFloat(document.getElementById('excess-air').value);
  const flueGasTempC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  if (isNaN(temperatureC) || isNaN(inletAirTempC) || isNaN(pressureBar) ||
      isNaN(excessAirPerc) || isNaN(flueGasTempC) || isNaN(referenceO2)) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Get fuel flow rate and unit
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  const flowRateUnit = document.getElementById('fuel-flow-rate').dataset.unit || 'm³/h';

  if (isNaN(fuelFlowRate) || fuelFlowRate <= 0) {
    alert('Please enter a valid fuel flow rate.');
    return;
  }

  // Check if cost calculation is enabled
  const costEnabled = document.getElementById('enable-cost-calculation').checked;
  let fuelCost = 0;
  let minFlowRate = 0;
  let maxFlowRate = 0;

  if (costEnabled) {
    fuelCost = parseFloat(document.getElementById('fuel-cost').value);
    minFlowRate = parseFloat(document.getElementById('min-flow-rate').value);
    maxFlowRate = parseFloat(document.getElementById('max-flow-rate').value);

    if (isNaN(fuelCost) || fuelCost < 0 || isNaN(minFlowRate) || isNaN(maxFlowRate) ||
        minFlowRate <= 0 || maxFlowRate <= minFlowRate) {
      alert('Please enter valid fuel cost and flow rates.');
      return;
    }
  }

  // Generate combustion points
  if (costEnabled) {
    generateCombustionPoints(minFlowRate, maxFlowRate);
  }

  // Collect O2 and CO2 readings
  let combustionPoints = [];
  if (costEnabled) {
    for (let i = 0; i < 10; i++) {
      const o2 = parseFloat(document.getElementById(`o2-reading-${i}`).value);
      const co2 = parseFloat(document.getElementById(`co2-reading-${i}`).value);
      if (isNaN(o2) || o2 < 0 || o2 > 20 || isNaN(co2) || co2 < 0 || co2 > 20) {
        alert(`Please enter valid O₂ and CO₂ readings for Point ${i + 1}.`);
        return;
      }
      combustionPoints.push({
        flowRate: minFlowRate + i * (maxFlowRate - minFlowRate) / 9,
        o2: o2,
        co2: co2
      });
    }
  }

  // Disable Calculate button to prevent multiple submissions
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.disabled = true;
  calculateButton.textContent = 'Calculating...';

  // Initialize Web Worker and send data
  initWorker({
    mixture,
    temperatureC,
    inletAirTempC,
    pressureBar,
    fuelFlowRate,
    flowRateUnit,
    excessAirPerc,
    flueGasTempC,
    referenceO2,
    costEnabled,
    fuelCost,
    minFlowRate,
    maxFlowRate,
    combustionPoints
  });
});

// Function to initialize and communicate with the Web Worker
function initWorker(data) {
  if (!worker) {
    worker = new Worker('worker.js');

    worker.onmessage = function(e) {
      const results = e.data;
      displayResults(results);
      calculateButton.disabled = false;
      calculateButton.textContent = 'Calculate';
      worker.terminate();
      worker = null;
    };

    worker.onerror = function(error) {
      console.error('Worker error:', error);
      alert('An error occurred during calculations.');
      calculateButton.disabled = false;
      calculateButton.textContent = 'Calculate';
      worker.terminate();
      worker = null;
    };
  }

  worker.postMessage(data);
}

// Function to display results
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
=== Combustion Efficiency and Emissions ===

Average Molar Mass of Fuel Mixture: ${results.averageMolarMass.toFixed(2)} g/mol
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
CO₂: ${results.nCO2.toExponential(4)} mol/s
H₂O: ${results.nH2O.toExponential(4)} mol/s
SO₂: ${results.nSO2.toExponential(4)} mol/s
CO: ${results.nCO.toExponential(4)} mol/s
H₂: ${results.nH2.toExponential(4)} mol/s
O₂: ${results.nO2Excess.toExponential(4)} mol/s
N₂: ${results.nN2.toExponential(4)} mol/s
NOx: ${results.nNOx.toExponential(4)} mol/s
Ash: ${results.nAsh.toExponential(4)} mol/s

SOx Emissions: ${results.SOx_ppm.toFixed(2)} ppm
NOx Emissions: ${results.NOx_ppm.toFixed(2)} ppm

=== Combustion Efficiency ===
${results.efficiencyDetails}

=== Fuel Cost Analysis ===
${results.costAnalysis}
  `;
}

// Function to generate combustion points
function generateCombustionPoints(minFlow, maxFlow) {
  const pointsContainer = document.getElementById('combustion-points');
  pointsContainer.innerHTML = ''; // Clear existing points

  const step = (maxFlow - minFlow) / 9; // 10 points including min and max

  for (let i = 0; i < 10; i++) {
    const flowRate = minFlow + i * step;
    const combustionPoint = document.createElement('div');
    combustionPoint.className = 'combustion-point';
    combustionPoint.innerHTML = `
      <strong>Point ${i + 1} - Flow Rate: ${flowRate.toFixed(2)} ${document.getElementById('fuel-flow-rate').dataset.unit || 'm³/h'}</strong><br>
      <label for="o2-reading-${i}">O₂ Reading (%):</label>
      <input type="number" id="o2-reading-${i}" min="0" max="20" step="0.1" required><br>
      <label for="co2-reading-${i}">CO₂ Reading (%):</label>
      <input type="number" id="co2-reading-${i}" min="0" max="20" step="0.1" required><br>
    `;
    pointsContainer.appendChild(combustionPoint);
  }
}
