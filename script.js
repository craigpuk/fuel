// script.js

// Global Variables
let fuelData = [];
let fuelCount = 0;
let customFuels = [];
let worker;

// Fetch predefined fuels from fuel_data.json
fetch('fuel_data.json')
  .then(response => response.json())
  .then(data => {
    fuelData = data.filter(fuel => fuel.Name !== "Custom Fuel"); // Exclude the placeholder
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
  addFuel(); // Add the first fuel selection
  setupCustomFuelForm();
  setupCostCalculationToggle();
  setupCalculateButton();
}

// Add a fuel selection row
function addFuel(fuel = null, percentage = null) {
  const fuelList = document.getElementById('fuel-list');
  const fuelItem = document.createElement('div');
  fuelItem.className = 'fuel-item';
  fuelItem.id = `fuel-item-${fuelCount}`;

  // Fuel Select Dropdown
  const fuelSelect = document.createElement('select');
  fuelSelect.id = `fuel-select-${fuelCount}`;
  updateFuelOptions(fuelSelect);

  // Set selected fuel if provided
  if (fuel) {
    const optionToSelect = Array.from(fuelSelect.options).find(option => option.value === fuel);
    if (optionToSelect) optionToSelect.selected = true;
  }

  // Percentage Input
  const percentageInput = document.createElement('input');
  percentageInput.type = 'number';
  percentageInput.id = `fuel-percentage-${fuelCount}`;
  percentageInput.placeholder = 'Percentage (%)';
  percentageInput.min = 0;
  percentageInput.max = 100;
  if (percentage !== null) {
    percentageInput.value = percentage;
  }

  // Remove Button
  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.className = 'remove-fuel-button';
  removeButton.addEventListener('click', () => {
    fuelItem.remove();
    updateFlowRateLabel();
  });

  // Event Listener to update flow rate label when fuel type changes
  fuelSelect.addEventListener('change', updateFlowRateLabel);

  // Append elements to fuel item
  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
  updateFlowRateLabel();
}

// Update the options in the fuel select dropdown
function updateFuelOptions(selectElement) {
  // Clear existing options
  selectElement.innerHTML = '';

  // Add default "Select Fuel" option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.text = 'Select Fuel';
  selectElement.appendChild(defaultOption);

  // Add predefined fuels
  fuelData.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `${fuel.Name} (${fuel.Symbol})`;
    selectElement.appendChild(option);
  });

  // Add custom fuels
  customFuels.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = `custom-${index}`;
    option.text = `${fuel.Name} (${fuel.Symbol})`;
    selectElement.appendChild(option);
  });
}

// Show the custom fuel creation form
function showCustomFuelForm() {
  document.getElementById('custom-fuel-form').style.display = 'block';
}

// Hide the custom fuel creation form
function hideCustomFuelForm() {
  document.getElementById('custom-fuel-form').style.display = 'none';
}

// Setup the custom fuel form event listeners
function setupCustomFuelForm() {
  const customFuelForm = document.getElementById('custom-fuel-form-element');
  customFuelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCustomFuel();
  });

  document.querySelector('.close-button')?.addEventListener('click', hideCustomFuelForm);
  document.getElementById('cancel-custom-fuel-button').addEventListener('click', hideCustomFuelForm);
}

// Save the custom fuel and add it to the fuel selection
function saveCustomFuel() {
  const name = document.getElementById('custom-fuel-name').value.trim();
  const formula = document.getElementById('custom-fuel-formula').value.trim();
  const symbol = document.getElementById('custom-fuel-symbol').value.trim();
  const type = document.getElementById('custom-fuel-type').value;
  const molarMass = parseFloat(document.getElementById('custom-fuel-molar-mass').value);
  const heatingValue = parseFloat(document.getElementById('custom-fuel-heating-value').value);
  const hhv = parseFloat(document.getElementById('custom-fuel-hhv').value);
  const C = parseFloat(document.getElementById('custom-fuel-C').value);
  const H = parseFloat(document.getElementById('custom-fuel-H').value);
  const O = parseFloat(document.getElementById('custom-fuel-O').value);
  const N = parseFloat(document.getElementById('custom-fuel-N').value);
  const S = parseFloat(document.getElementById('custom-fuel-S').value);
  const ash = parseFloat(document.getElementById('custom-fuel-ash').value);
  const moisture = parseFloat(document.getElementById('custom-fuel-moisture').value);

  // Validate inputs
  if (!name || !formula || !symbol || !type || isNaN(molarMass) || isNaN(heatingValue) || isNaN(hhv) ||
      isNaN(C) || isNaN(H) || isNaN(O) || isNaN(N) || isNaN(S) || isNaN(ash) || isNaN(moisture)) {
    alert('Please fill out all fields correctly.');
    return;
  }

  // Create the custom fuel object
  const customFuel = {
    "Name": name,
    "Type": type,
    "Formula": formula,
    "Symbol": symbol,
    "MolarMass": molarMass,
    "C": C,
    "H": H,
    "O": O,
    "N": N,
    "S": S,
    "AshContent": ash,
    "MoistureContent": moisture,
    "HeatingValue": heatingValue,
    "HHV": hhv
  };

  // Add to custom fuels array
  customFuels.push(customFuel);

  // Update fuel options in all existing select elements
  const allSelects = document.querySelectorAll('.fuel-item select');
  allSelects.forEach(select => {
    updateFuelOptions(select);
  });

  // Clear and hide the custom fuel form
  document.getElementById('custom-fuel-form-element').reset();
  hideCustomFuelForm();
}

// Update flow rate label based on selected fuel types
function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  let containsSolidFuel = false;
  let containsLiquidFuel = false;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    if (fuelSelect && fuelSelect.value !== '') {
      const fuelIndex = parseInt(fuelSelect.value);
      let fuel;
      if (isNaN(fuelIndex)) {
        // Custom fuel
        const customIndex = parseInt(fuelSelect.value.split('-')[1]);
        fuel = customFuels[customIndex];
      } else {
        // Predefined fuel
        fuel = fuelData[fuelIndex];
      }

      if (fuel.Type === 'Solid') {
        containsSolidFuel = true;
      } else if (fuel.Type === 'Liquid') {
        containsLiquidFuel = true;
      }
    }
  }

  if (containsSolidFuel || containsLiquidFuel) {
    flowRateLabel.textContent = 'Fuel Mass Flow Rate (kg/h):';
    fuelFlowRateInput.placeholder = 'Mass Flow Rate (kg/h)';
  } else {
    flowRateLabel.textContent = 'Fuel Volumetric Flow Rate (m³/h):';
    fuelFlowRateInput.placeholder = 'Volumetric Flow Rate (m³/h)';
  }
}

// Setup the cost calculation toggle
function setupCostCalculationToggle() {
  const costCheckbox = document.getElementById('enable-cost-calculation');
  costCheckbox.addEventListener('change', () => {
    const costInputs = document.getElementById('cost-inputs');
    if (costCheckbox.checked) {
      costInputs.style.display = 'block';
      generateCombustionPoints();
    } else {
      costInputs.style.display = 'none';
      clearCombustionPoints();
    }
  });
}

// Generate combustion points inputs
function generateCombustionPoints() {
  const costInputs = document.getElementById('cost-inputs');
  const minFlowRate = parseFloat(document.getElementById('min-flow-rate').value);
  const maxFlowRate = parseFloat(document.getElementById('max-flow-rate').value);

  if (isNaN(minFlowRate) || isNaN(maxFlowRate) || minFlowRate >= maxFlowRate) {
    alert('Please enter valid min and max flow rates (min < max).');
    return;
  }

  const combustionPointsContainer = document.getElementById('combustion-points');
  combustionPointsContainer.innerHTML = ''; // Clear existing points

  const points = 10;
  const step = (maxFlowRate - minFlowRate) / (points - 1);

  for (let i = 0; i < points; i++) {
    const currentFlowRate = minFlowRate + step * i;

    const pointDiv = document.createElement('div');
    pointDiv.className = 'point';

    const flowRateLabel = document.createElement('label');
    flowRateLabel.textContent = `Flow Rate ${i + 1} (${currentFlowRate.toFixed(2)}):`;
    flowRateLabel.htmlFor = `flow-rate-${i}`;

    const o2Input = document.createElement('input');
    o2Input.type = 'number';
    o2Input.id = `o2-${i}`;
    o2Input.placeholder = 'O₂ Reading (%)';
    o2Input.min = 0;
    o2Input.max = 100;
    o2Input.required = true;

    const co2Input = document.createElement('input');
    co2Input.type = 'number';
    co2Input.id = `co2-${i}`;
    co2Input.placeholder = 'CO₂ Reading (%)';
    co2Input.min = 0;
    co2Input.max = 100;
    co2Input.required = true;

    pointDiv.appendChild(flowRateLabel);
    pointDiv.appendChild(o2Input);
    pointDiv.appendChild(co2Input);
    combustionPointsContainer.appendChild(pointDiv);
  }
}

// Clear combustion points inputs
function clearCombustionPoints() {
  const combustionPointsContainer = document.getElementById('combustion-points');
  combustionPointsContainer.innerHTML = '';
}

// Setup the Calculate button event listener
function setupCalculateButton() {
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.addEventListener('click', () => {
    performCalculation();
  });
}

// Perform the combustion and cost calculations
function performCalculation() {
  // Gather fuel mixture
  let mixture = [];
  let totalPercentage = 0;
  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    const percentageInput = document.getElementById(`fuel-percentage-${i}`);
    if (fuelSelect && percentageInput) {
      const fuelValue = fuelSelect.value;
      const percentage = parseFloat(percentageInput.value);
      if (!fuelValue || isNaN(percentage) || percentage <= 0) {
        alert('Please select a fuel and enter a valid percentage for all fuel entries.');
        return;
      }

      let fuel;
      if (fuelValue.startsWith('custom-')) {
        // Custom fuel
        const customIndex = parseInt(fuelValue.split('-')[1]);
        fuel = customFuels[customIndex];
      } else {
        // Predefined fuel
        const fuelIndex = parseInt(fuelValue);
        fuel = fuelData[fuelIndex];
      }

      mixture.push({
        fuel: fuel,
        percentage: percentage
      });
      totalPercentage += percentage;
    }
  }

  if (Math.abs(totalPercentage - 100) > 0.01) {
    alert('Total fuel percentages must add up to 100%.');
    return;
  }

  // Gather combustion variables
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const inletAirTempC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAir = parseFloat(document.getElementById('excess-air').value);
  const flueGasTempC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  if (
    isNaN(fuelFlowRate) || fuelFlowRate <= 0 ||
    isNaN(temperatureC) ||
    isNaN(inletAirTempC) ||
    isNaN(pressureBar) ||
    isNaN(excessAir) ||
    isNaN(flueGasTempC) ||
    isNaN(referenceO2)
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  // Check if cost calculation is enabled
  const isCostCalculationEnabled = document.getElementById('enable-cost-calculation').checked;
  let fuelCost = null;
  let minFlowRate = null;
  let maxFlowRate = null;
  let combustionPoints = [];

  if (isCostCalculationEnabled) {
    fuelCost = parseFloat(document.getElementById('fuel-cost').value);
    minFlowRate = parseFloat(document.getElementById('min-flow-rate').value);
    maxFlowRate = parseFloat(document.getElementById('max-flow-rate').value);

    if (
      isNaN(fuelCost) || fuelCost <= 0 ||
      isNaN(minFlowRate) || minFlowRate <= 0 ||
      isNaN(maxFlowRate) || maxFlowRate <= 0 ||
      minFlowRate >= maxFlowRate
    ) {
      alert('Please enter valid fuel cost and flow rate ranges (min < max).');
      return;
    }

    // Gather O₂ and CO₂ readings
    const points = 10;
    for (let i = 0; i < points; i++) {
      const o2 = parseFloat(document.getElementById(`o2-${i}`).value);
      const co2 = parseFloat(document.getElementById(`co2-${i}`).value);

      if (isNaN(o2) || o2 < 0 || o2 > 100 ||
          isNaN(co2) || co2 < 0 || co2 > 100) {
        alert(`Please enter valid O₂ and CO₂ readings for point ${i + 1}.`);
        return;
      }

      combustionPoints.push({
        flowRate: parseFloat(document.getElementById(`flow-rate-${i}`).textContent.match(/([\d.]+)/)[1]),
        o2: o2,
        co2: co2
      });
    }
  }

  // Prepare data to send to worker
  const dataToSend = {
    mixture: mixture,
    temperatureC: temperatureC,
    inletAirTemperatureC: inletAirTempC,
    pressureBar: pressureBar,
    fuelFlowRate: fuelFlowRate,
    excessAirPercentage: excessAir,
    flueGasTemperatureC: flueGasTempC,
    referenceO2: referenceO2,
    isCostCalculationEnabled: isCostCalculationEnabled,
    fuelCost: fuelCost,
    minFlowRate: minFlowRate,
    maxFlowRate: maxFlowRate,
    combustionPoints: combustionPoints
  };

  // Initialize Web Worker if not already done
  if (!worker) {
    worker = new Worker('worker.js');
    worker.onmessage = function(e) {
      const results = e.data;
      if (results.error) {
        alert(`Error: ${results.error}`);
        return;
      }
      displayResults(results);
    };
    worker.onerror = function(error) {
      console.error('Worker error:', error);
      alert('An error occurred during calculations.');
    };
  }

  // Disable the calculate button to prevent multiple clicks
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.disabled = true;
  calculateButton.textContent = 'Calculating...';

  // Send data to the worker
  worker.postMessage(dataToSend);

  // Re-enable the calculate button after some time (worker will handle response)
  // Alternatively, you can re-enable it in the worker's onmessage handler
}

// Display the calculation results
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
=== Combustion Efficiency ===
Overall Efficiency: ${results.combustionEfficiency}% 

=== Combustion Points ===
${results.combustionPoints.map((point, index) => `
Point ${index + 1}:
  Flow Rate: ${point.flowRate.toFixed(2)} ${results.flowRateUnit}
  O₂ Reading: ${point.o2.toFixed(2)}%
  CO₂ Reading: ${point.co2.toFixed(2)}%
  Efficiency: ${point.efficiency.toFixed(2)}%
  Cost at Point: $${point.cost.toFixed(2)}
`).join('\n')}

=== Fuel Cost Analysis ===
${results.costAnalysis}
`;
  
  // Re-enable the calculate button
  const calculateButton = document.getElementById('calculate-button');
  calculateButton.disabled = false;
  calculateButton.textContent = 'Calculate';
}
