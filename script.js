// script.js

// Global variables
let fuelData = [];
let fuelCount = 0;
let worker;

// Initialize Chart.js charts
let combustionEfficiencyChart;
let combustionProductsChart;

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

  // Add a default option
  const defaultOption = document.createElement('option');
  defaultOption.value = "";
  defaultOption.text = "Select Fuel";
  fuelSelect.appendChild(defaultOption);

  fuelData.forEach((fuel, index) => {
    const option = document.createElement('option');
    option.value = index;
    // Use innerHTML to render HTML tags like <sub>
    option.innerHTML = `${fuel.Name} (${fuel.Symbol})`;
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
    if (fuelSelect && fuelSelect.value !== "") {
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
  const relativeHumidity = parseFloat(document.getElementById('humidity').value);

  if (
    isNaN(temperatureC) || isNaN(pressureBar) ||
    isNaN(excessAirPercentage) || isNaN(flueGasTemperature) ||
    isNaN(inletAirTemperatureC) || isNaN(referenceO2) ||
    isNaN(relativeHumidity)
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
    referenceO2,
    relativeHumidity
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
  flueGasTemperatureC,
  inletAirTemperatureC,
  referenceO2,
  relativeHumidity
) {
  if (typeof worker === 'undefined') {
    // Ensure the path to worker.js is correct relative to index.html
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
      createCharts(results);

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
    flueGasTemperatureC,
    inletAirTemperatureC,
    referenceO2,
    relativeHumidity
  });
}

// Display results
function displayResults(results) {
  const output = document.getElementById('output');
  output.innerHTML = `
Average Molar Weight of Fuel Mixture: ${results.totalMolarMass.toFixed(2)} g/mol<br>
Lower Heating Value (LHV): ${results.totalLHV.toFixed(2)} MJ/kg<br>
Higher Heating Value (HHV): ${results.totalHHV.toFixed(2)} MJ/kg<br><br>

Molar Flow Rate of Fuel: ${results.nFuel.toFixed(4)} mol/s<br>
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s<br>
Required Air Flow Rate: ${results.airFlowRate.toFixed(2)} ${results.flowRateUnit}<br>
Combustion Efficiency: ${results.combustionEfficiency.toFixed(2)}%<br>
Flame Temperature: ${(results.combustionResults.flameTemperatureK - 273.15).toFixed(2)} °C<br>
Fuel Gas Density: ${results.fuelGasDensity.toFixed(4)} kg/m³<br><br>

=== Combustion Products ===<br>
Molar flow rates (mol/s):<br>
CO<sub>2</sub>: ${results.combustionResults.nCO2.toExponential(4)} mol/s<br>
H<sub>2</sub>O: ${results.combustionResults.nH2O.toExponential(4)} mol/s<br>
SO<sub>2</sub>: ${results.combustionResults.nSO2.toExponential(4)} mol/s<br>
CO: ${results.combustionResults.nCO.toExponential(4)} mol/s<br>
H<sub>2</sub>: ${results.combustionResults.nUnburnedH2.toExponential(4)} mol/s<br>
O<sub>2</sub>: ${results.combustionResults.nO2Excess.toExponential(4)} mol/s<br>
N<sub>2</sub>: ${results.combustionResults.nN2.toExponential(4)} mol/s<br>
NO<sub>x</sub>: ${results.combustionResults.nNOx.toExponential(4)} mol/s<br>
Ash: ${results.combustionResults.nAsh.toExponential(4)} mol/s<br><br>

SO<sub>x</sub> Emissions: ${results.SOx_ppm.toFixed(2)} ppm<br><br>

=== Volume Percentages (Wet Basis) ===<br>
CO<sub>2</sub>: ${results.volumePercentagesWet.CO2.toFixed(2)}%<br>
H<sub>2</sub>O: ${results.volumePercentagesWet.H2O.toFixed(2)}%<br>
SO<sub>2</sub>: ${results.volumePercentagesWet.SO2.toFixed(2)}%<br>
H<sub>2</sub>: ${results.volumePercentagesWet.H2.toFixed(2)}%<br>
O<sub>2</sub>: ${results.volumePercentagesWet.O2.toFixed(2)}%<br>
N<sub>2</sub>: ${results.volumePercentagesWet.N2.toFixed(2)}%<br>
NO<sub>x</sub>: ${results.volumePercentagesWet.NOx.toFixed(2)}%<br>
Ash: ${results.volumePercentagesWet.Ash.toFixed(2)}%<br><br>

=== Volume Percentages (Dry Basis) ===<br>
CO<sub>2</sub>: ${results.volumePercentagesDry.CO2.toFixed(2)}%<br>
SO<sub>2</sub>: ${results.volumePercentagesDry.SO2.toFixed(2)}%<br>
CO: ${results.volumePercentagesDry.CO.toFixed(2)}%<br>
H<sub>2</sub>: ${results.volumePercentagesDry.H2.toFixed(2)}%<br>
O<sub>2</sub>: ${results.volumePercentagesDry.O2.toFixed(2)}%<br>
N<sub>2</sub>: ${results.volumePercentagesDry.N2.toFixed(2)}%<br>
NO<sub>x</sub>: ${results.volumePercentagesDry.NOx.toFixed(2)}%<br>
Ash: ${results.volumePercentagesDry.Ash.toFixed(2)}%<br><br>

=== Advanced NO<sub>x</sub> Calculations ===<br>
NO<sub>x</sub> (ppm): ${results.NOx_ppm.toFixed(2)} ppm<br>
NO<sub>x</sub> normalized (mg/Nm³): ${results.NOx_normalized.toFixed(2)} mg/Nm³<br>
NO<sub>x</sub> flue gas temp (mg/Am³): ${results.NOx_flue_gas_temp.toFixed(2)} mg/Am³<br>
NO<sub>x</sub> corrected O₂ normalized (mg/Nm³): ${results.NOx_corrected_O2_normalized.toFixed(2)} mg/Nm³<br>
NO<sub>x</sub> corrected O₂ actual (mg/Am³): ${results.NOx_corrected_O2_actual.toFixed(2)} mg/Am³<br><br>

=== CO Calculations ===<br>
CO (ppm): ${results.CO_ppm.toFixed(2)} ppm<br><br>

=== Combustion Efficiency ===<br>
Combustion Efficiency is calculated based on the ratio of actual CO<sub>2</sub>% to stoichiometric CO<sub>2</sub>%:<br>
${results.combustionEfficiency.toFixed(2)}%<br><br>

=== Notes ===<br>
- CO ppm represents carbon monoxide emissions from incomplete combustion.<br>
- Other sources of CO (e.g., boiler walls) are not accounted for in this calculator.<br>
- Ensure proper maintenance and operation of combustion systems to minimize CO emissions.<br>
- Combustion efficiency above 100% indicates higher actual CO<sub>2</sub>% than stoichiometric, which may suggest measurement errors.<br>
- Relative Humidity affects the combustion process by introducing additional water vapor.<br>
`;
}

// Create Charts using Chart.js
function createCharts(results) {
  // Combustion Efficiency Chart
  const ctxCE = document.getElementById('combustion-efficiency-chart').getContext('2d');
  if (combustionEfficiencyChart) {
    combustionEfficiencyChart.destroy();
  }
  combustionEfficiencyChart = new Chart(ctxCE, {
    type: 'bar',
    data: {
      labels: ['Combustion Efficiency'],
      datasets: [{
        label: '%',
        data: [results.combustionEfficiency],
        backgroundColor: ['rgba(75, 192, 192, 0.6)'],
        borderColor: ['rgba(75, 192, 192, 1)'],
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 150
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.parsed.y.toFixed(2)}%`;
            }
          }
        }
      }
    }
  });

  // Combustion Products Pie Chart
  const ctxCP = document.getElementById('combustion-products-chart').getContext('2d');
  if (combustionProductsChart) {
    combustionProductsChart.destroy();
  }
  combustionProductsChart = new Chart(ctxCP, {
    type: 'pie',
    data: {
      labels: ['CO₂', 'H₂O', 'SO₂', 'CO', 'H₂', 'O₂', 'N₂', 'NOₓ', 'Ash'],
      datasets: [{
        data: [
          results.volumePercentagesDry.CO2.toFixed(2),
          results.volumePercentagesDry.H2O.toFixed(2),
          results.volumePercentagesDry.SO2.toFixed(2),
          results.volumePercentagesDry.CO.toFixed(2),
          results.volumePercentagesDry.H2.toFixed(2),
          results.volumePercentagesDry.O2.toFixed(2),
          results.volumePercentagesDry.N2.toFixed(2),
          results.volumePercentagesDry.NOx.toFixed(2),
          results.volumePercentagesDry.Ash.toFixed(2)
        ],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#C9CBCF',
          '#FF6384',
          '#36A2EB'
        ],
        hoverOffset: 4
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${context.parsed}%`;
            }
          }
        }
      }
    }
  });
}

// Export results as CSV
document.getElementById('export-csv-button').addEventListener('click', exportCSV);

function exportCSV() {
  const output = document.getElementById('output').innerText;
  const lines = output.split('<br>').map(line => line.replace(/<[^>]+>/g, ''));
  const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
  const encodedUri = encodeURI(csvContent);
  
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'combustion_results.csv');
  document.body.appendChild(link); // Required for FF

  link.click();
  document.body.removeChild(link);
}

// Export results as PDF
document.getElementById('export-pdf-button').addEventListener('click', exportPDF);

function exportPDF() {
  // Use jsPDF library for PDF generation
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  script.onload = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Combustion Results", 10, 20);
    doc.setFontSize(12);
    const output = document.getElementById('output').innerText;
    const lines = doc.splitTextToSize(output, 180);
    doc.text(lines, 10, 30);
    doc.save('combustion_results.pdf');
  };
  document.head.appendChild(script);
}

// Share results functionality
document.getElementById('share-results-button').addEventListener('click', shareResults);

function shareResults() {
  const output = document.getElementById('output').innerText;
  const encodedData = encodeURIComponent(output);
  const shareURL = `https://yourdomain.com/share?data=${encodedData}`; // Replace with your actual domain and sharing endpoint

  // Create a temporary input to copy the URL
  const tempInput = document.createElement('input');
  tempInput.value = shareURL;
  document.body.appendChild(tempInput);
  tempInput.select();
  tempInput.setSelectionRange(0, 99999); // For mobile devices

  try {
    document.execCommand('copy');
    alert('Shareable link copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy the link.');
  }

  document.body.removeChild(tempInput);
}

// Optional: Function to handle importing experimental data
// You can expand this based on your specific requirements
/*
document.getElementById('import-data-button').addEventListener('change', importData);

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      // Process imported data and update the UI or calculations as needed
      console.log('Imported Data:', importedData);
    } catch (error) {
      console.error('Error parsing imported data:', error);
      alert('Failed to parse imported data.');
    }
  };
  reader.readAsText(file);
}
*/

// Optional: Function to display detailed calculation steps
// You can implement this based on your specific requirements
/*
function displayDetailedCalculations(results) {
  const detailedOutput = document.getElementById('detailed-output');
  detailedOutput.innerHTML = `
    <h3>Detailed Calculations</h3>
    <p>Here you can display step-by-step calculations...</p>
  `;
}
*/

// Additional helper functions can be added here as needed
