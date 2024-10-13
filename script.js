// script.js

let fuelData = [];
let fuelCount = 0;
let worker;

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

function initializeFuelSelection() {
  document.getElementById('add-fuel-button').addEventListener('click', addFuel);
  addFuel();
}

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

function updateFlowRateLabel() {
  const flowRateLabel = document.getElementById('flow-rate-label');
  const fuelFlowRateInput = document.getElementById('fuel-flow-rate');
  let containsSolidFuel = false;

  for (let i = 0; i < fuelCount; i++) {
    const fuelSelect = document.getElementById(`fuel-select-${i}`);
    if (fuelSelect) {
      const fuelIndex = parseInt(fuelSelect.value);
      const fuel = fuelData[fuelIndex];
      if (fuel.Type === 'Solid' || fuel.Type === 'Liquid') {
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

document.getElementById('calculate-button').addEventListener('click', calculateCombustion);

function calculateCombustion() {
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

  let containsSolidFuel = mixture.some(component => component.fuel.Type === 'Solid');

  const temperatureC = parseFloat(document.getElementById('temperature').value);
  const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
  const pressureBar = parseFloat(document.getElementById('pressure').value);
  const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
  const flueGasTemperatureC = parseFloat(document.getElementById('flue-gas-temperature').value);
  const referenceO2 = parseFloat(document.getElementById('reference-o2').value);

  if (
    isNaN(temperatureC) || isNaN(pressureBar) ||
    isNaN(excessAirPercentage) || isNaN(flueGasTemperatureC) || isNaN(referenceO2)
  ) {
    alert('Please enter valid combustion variables.');
    return;
  }

  const fuelFlowRate = parseFloat(document.getElementById('fuel-flow-rate').value);
  if (isNaN(fuelFlowRate) || fuelFlowRate <= 0) {
    alert('Please enter a valid fuel flow rate.');
    return;
  }

  const isMassFlowRate = containsSolidFuel;
  document.getElementById('calculate-button').disabled = true;
  document.getElementById('calculate-button').textContent = 'Calculating...';

  const minFlowRate = parseFloat(document.getElementById('min-flow-rate').value);
  const maxFlowRate = parseFloat(document.getElementById('max-flow-rate').value);

  let combustionPoints = [];
  for (let i = 0; i < 10; i++) {
    const flowRate = minFlowRate + i * ((maxFlowRate - minFlowRate) / 9);
    const o2 = parseFloat(document.getElementById(`o2-${i}`).value);
    const co2 = parseFloat(document.getElementById(`co2-${i}`).value);
    combustionPoints.push({ flowRate, o2, co2 });
  }

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
    console.error('Worker error:', error);
    alert('An error occurred during calculations.');
    document.getElementById('calculate-button').disabled = false;
    document.getElementById('calculate-button').textContent = 'Calculate';
  };

  worker.postMessage({
    mixture,
    temperatureC,
    inletAirTemperatureC,
    pressureBar,
    fuelFlowRate,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2,
    isCostCalculationEnabled: document.getElementById('enable-cost-calculation').checked,
    fuelCost: parseFloat(document.getElementById('fuel-cost').value),
    minFlowRate,
    maxFlowRate,
    combustionPoints
  });
}

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
CO: ${results.nCO.toExponential(4)} mol/s
H2: ${results.nUnburnedH2.toExponential(4)} mol/s
O2: ${results.nO2Excess.toExponential(4)} mol/s
N2: ${results.nN2.toExponential(4)} mol/s
NOx: ${results.nNOx.toExponential(4)} mol/s
Ash: ${results.nAsh.toExponential(4)} mol/s

SOx Emissions: ${results.SOx_ppm.toFixed(2)} ppm

=== Advanced NOₓ Calculations ===
NOₓ (ppm): ${results.NOx_ppm.toFixed(2)} ppm
NOₓ_normalized (mg/Nm³): ${results.NOx_normalized.toFixed(2)}
NOₓ_flue_gas_temp (mg/Am³): ${results.NOx_flue_gas_temp.toFixed(2)}
NOₓ_corrected_O₂_normalized (mg/Nm³): ${results.NOx_corrected_O2_normalized.toFixed(2)}
NOₓ_corrected_O₂_actual (mg/Am³): ${results.NOx_corrected_O2_actual.toFixed(2)}

=== Cost Analysis ===
${results.costAnalysis}
`;
}
