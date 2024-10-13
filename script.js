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
    option.text = `${fuel.Name} (${fuel.Symbol})`;
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

// Placeholder for worker initialization and calculation logic
document.getElementById('calculate-button').addEventListener('click', () => {
  // Placeholder: Call the worker for calculation
  alert('Calculation triggered. Placeholder for further development.');
});
