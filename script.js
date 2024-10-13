// Global variables
let fuelData = [];
let fuelCount = 0;
let worker;

// Initialize Web Worker
if (window.Worker) {
  worker = new Worker('worker.js');
  worker.onmessage = function (e) {
    const results = e.data;
    if (results.error) {
      alert(`Error: ${results.error}`);
    } else {
      displayResults(results);
    }
  };
} else {
  alert('Your browser does not support Web Workers.');
}

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
  document.getElementById('add-custom-fuel-button').addEventListener('click', addCustomFuel);
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
    option.text = `${fuel.Name} (${fuel.Formula})`;
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

  fuelSelect.addEventListener('change', updateFlowRateLabel);

  fuelItem.appendChild(fuelSelect);
  fuelItem.appendChild(percentageInput);
  fuelItem.appendChild(removeButton);
  fuelList.appendChild(fuelItem);

  fuelCount++;
  updateFlowRateLabel();
}

// Add custom fuel input
function addCustomFuel() {
  const customFuel = promptCustomFuelInput(); // Function to get fuel properties from the user
  if (customFuel) {
    fuelData.push(customFuel);
    updateFuelOptions(); // Function to refresh fuel dropdowns with the new fuel added
  }
}

function promptCustomFuelInput() {
  const name = prompt("Fuel Name:");
  const formula = prompt("Chemical Formula (e.g., CH4):");
  const molarMass = parseFloat(prompt("Molar Mass (g/mol):"));
  const heatingValue = parseFloat(prompt("Heating Value (MJ/kg):"));
  const type = prompt("Fuel Type (Gas, Liquid, Solid):");

  if (!name || !formula || isNaN(molarMass) || isNaN(heatingValue) || !type) {
    alert("Please provide valid values for all fields.");
    return null;
  }

  return {
    Name: name,
    Formula: formula,
    MolarMass: molarMass,
    HeatingValue: heatingValue,
    Type: type,
    C: 0, H: 0, O: 0, N: 0, S: 0, AshContent: 0, MoistureContent: 0 // Initialize elements
  };
}

// Update fuel options dynamically
function updateFuelOptions() {
  document.querySelectorAll('select[id^="fuel-select"]').forEach((select) => {
    select.innerHTML = '';
    fuelData.forEach((fuel, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.text = `${fuel.Name} (${fuel.Formula})`;
      select.appendChild(option);
    });
  });
}

// Update flow rate label based on fuel types selected
function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  
  let containsSolidFuel = false;
  let containsLiquidFuel = false;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    if (fuelSelect) {
      const fuelIndex = parseInt(fuelSelect.value);
      const fuel = fuelData[fuelIndex];
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

// Flame visualization
function drawFlame(length, width) {
  const canvas = document.getElementById('flameCanvas');
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'red';
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; 

  const startX = canvas.width / 2;
  const startY = canvas.height - 50;
  
  const flameHeight = Math.min(length * 10, canvas.height - 100); 
  const flameWidth = Math.min(width * 10, canvas.width / 2); 

  ctx.beginPath();
  ctx.moveTo(startX - flameWidth / 2, startY); 
  ctx.quadraticCurveTo(startX, startY - flameHeight / 2, startX - flameWidth / 4, startY - flameHeight); 
  ctx.quadraticCurveTo(startX, startY - flameHeight / 2, startX + flameWidth / 2, startY); 
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function updateFlameVisualization(flowRate) {
  const flameLength = Math.sqrt(flowRate) * 2; 
  const flameWidth = Math.sqrt(flowRate) * 1.2;
  drawFlame(flameLength, flameWidth);
}

// Toggle detailed calculations section
document.getElementById('toggle-details').addEventListener('click', () => {
  const detailsContent = document.getElementById('details-content');
  if (detailsContent.style.display === 'none') {
    detailsContent.style.display = 'block';
    document.getElementById('toggle-details').textContent = 'Info -';
  } else {
    detailsContent.style.display = 'none';
    document.getElementById('toggle-details').textContent = 'Info +';
  }
});

// Populate detailed calculation info
function populateCalculationDetails(results) {
  const detailsContent = document.getElementById('details-content');
  detailsContent.innerHTML = `
    <h4>Step-by-Step Calculations</h4>
    <p><strong>Stoichiometric CO₂:</strong> ${results.stoichiometricCO2.toFixed(2)}%</p>
    <p><strong>Actual CO₂:</strong> ${results.actualCO2.toFixed(2)}%</p>
    <p><strong>Combustion Efficiency:</strong> ${results.combustionEfficiency.toFixed(2)}%</p>
    <p><strong>Air Flow Rate:</strong> ${results.airFlowRate.toFixed(2)} ${results.flowRateUnit}</p>
    <p><strong>Molar Flow Rate of Fuel:</strong> ${results.nFuel.toFixed(4)} mol/s</p>
    <p><strong>Flame Temperature:</strong> ${(results.flameTemperatureK - 273.15).toFixed(2)} °C</p>
  `;
}

// Example of displayResults
function displayResults(results) {
  const output = document.getElementById('output');
  output.textContent = `
    Average Molar Weight of Fuel Mixture: ${results.totalMolarMass.toFixed(2)} g/mol
    Lower Heating Value (LHV): ${results.totalLHV.toFixed(2)} MJ/kg
    Combustion Efficiency: ${results.combustionEfficiency.toFixed(2)}%
  `;
  populateCalculationDetails(results);
  updateFlameVisualization(results.fuelFlowRate); // Update flame visualization
}

document.getElementById('calculate-button').addEventListener('click', () => {
  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperatureC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);
  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  
  let mixture = [];
  for (let i = 0; i < fuelCount; i++) {
    const fuelIndex = parseInt(document.getElementById(`fuel-select-${i}`).value);
    const percentage = parseFloat(document.getElementById(`fuel-percentage-${i}`).value);
    mixture.push({ fuel: fuelData[fuelIndex], percentage: percentage });
  }

  const isMassFlowRate = (document.getElementById('flow-rate-label').textContent.includes('Mass'));

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
});
