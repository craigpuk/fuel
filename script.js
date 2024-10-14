// script.js

document.addEventListener('DOMContentLoaded', () => {
  const fuelListDiv = document.getElementById('fuel-list');
  const addFuelButton = document.getElementById('add-fuel-button');
  const calculateButton = document.getElementById('calculate-button');
  const output = document.getElementById('output');
  
  let fuelCount = 0;

  // Load fuel data from fuel_data.json
  fetch('fuel_data.json')
    .then(response => response.json())
    .then(data => {
      window.fuelData = data;
      addFuelSelector();
    })
    .catch(error => {
      console.error('Error loading fuel data:', error);
      alert('Failed to load fuel data.');
    });

  // Function to add a new fuel selector
  function addFuelSelector() {
    const fuelItem = document.createElement('div');
    fuelItem.className = 'fuel-item';
    fuelItem.id = `fuel-item-${fuelCount}`;

    const select = document.createElement('select');
    select.id = `fuel-select-${fuelCount}`;

    // Populate options with fuel names and formulas
    window.fuelData.forEach((fuel, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.text = `${fuel.Name} (${fuel.Formula})`;
      select.appendChild(option);
    });

    const percentageInput = document.createElement('input');
    percentageInput.type = 'number';
    percentageInput.id = `fuel-percentage-${fuelCount}`;
    percentageInput.value = '100';
    percentageInput.min = '0';
    percentageInput.max = '100';
    percentageInput.step = 'any';
    percentageInput.placeholder = 'Percentage (%)';

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.type = 'button';
    removeButton.addEventListener('click', () => {
      fuelItem.remove();
      fuelCount--;
      updateFlowRateLabel();
    });

    fuelItem.appendChild(select);
    fuelItem.appendChild(percentageInput);
    fuelItem.appendChild(removeButton);
    fuelListDiv.appendChild(fuelItem);

    fuelCount++;
    updateFlowRateLabel();
  }

  // Function to update the fuel flow rate label based on fuel types
  function updateFlowRateLabel() {
    const flowRateLabel = document.getElementById('fuel-flow-rate-label');
    const fuelFlowRateInput = document.getElementById('fuel-flow-rate');

    let containsSolidFuel = false;
    let containsLiquidFuel = false;
    let containsGasFuel = false;

    for (let i = 0; i < fuelCount; i++) {
      const fuelSelect = document.getElementById(`fuel-select-${i}`);
      if (fuelSelect) {
        const fuelIndex = parseInt(fuelSelect.value);
        const fuel = window.fuelData[fuelIndex];
        if (fuel.Type === 'Solid') containsSolidFuel = true;
        if (fuel.Type === 'Liquid') containsLiquidFuel = true;
        if (fuel.Type === 'Gas') containsGasFuel = true;
      }
    }

    if ((containsSolidFuel && (containsLiquidFuel || containsGasFuel)) ||
        (containsLiquidFuel && containsGasFuel)) {
      alert('Cannot mix Gas, Liquid, and Solid fuels. Please select fuels of the same type.');
      // Remove the last added fuel to maintain single fuel type
      const lastFuelItem = document.getElementById(`fuel-item-${fuelCount - 1}`);
      if (lastFuelItem) {
        lastFuelItem.remove();
        fuelCount--;
      }
      return;
    }

    if (containsSolidFuel || containsLiquidFuel) {
      flowRateLabel.textContent = 'Fuel Mass Flow Rate (kg/h):';
      fuelFlowRateInput.placeholder = 'Mass Flow Rate (kg/h)';
    } else {
      flowRateLabel.textContent = 'Fuel Volumetric Flow Rate (m³/h):';
      fuelFlowRateInput.placeholder = 'Volumetric Flow Rate (m³/h)';
    }
  }

  addFuelButton.addEventListener('click', addFuelSelector);

  calculateButton.addEventListener('click', () => {
    const mixture = [];
    for (let i = 0; i < fuelCount; i++) {
      const fuelSelect = document.getElementById(`fuel-select-${i}`);
      const percentageInput = document.getElementById(`fuel-percentage-${i}`);
      if (fuelSelect && percentageInput) {
        const fuelIndex = parseInt(fuelSelect.value);
        const fuel = window.fuelData[fuelIndex];
        const percentage = parseFloat(percentageInput.value);
        if (isNaN(percentage) || percentage < 0) {
          alert('Please enter valid fuel percentages.');
          return;
        }
        mixture.push({ fuel, percentage });
      }
    }

    const flowRateInput = document.getElementById('fuel-flow-rate');
    const fuelFlowRate = parseFloat(flowRateInput.value);
    if (isNaN(fuelFlowRate) || fuelFlowRate <= 0) {
      alert('Please enter a valid fuel flow rate.');
      return;
    }

    const isMassFlowRate = (() => {
      const flowRateLabel = document.getElementById('fuel-flow-rate-label').textContent;
      return flowRateLabel.includes('Mass');
    })();

    const temperatureC = parseFloat(document.getElementById('temperature').value);
    const inletAirTemperatureC = parseFloat(document.getElementById('inlet-air-temperature').value);
    const pressureBar = parseFloat(document.getElementById('pressure').value);
    const excessAirPercentage = parseFloat(document.getElementById('excess-air').value);
    const flueGasTemperatureC = parseFloat(document.getElementById('flue-gas-temperature').value);
    const referenceO2 = parseFloat(document.getElementById('reference-o2').value);
    const airHumidity = parseFloat(document.getElementById('air-humidity').value);

    // Validate inputs
    if (
      isNaN(temperatureC) || isNaN(pressureBar) ||
      isNaN(excessAirPercentage) || isNaN(flueGasTemperatureC) ||
      isNaN(inletAirTemperatureC) || isNaN(referenceO2) ||
      isNaN(airHumidity) || airHumidity < 0 || airHumidity > 100
    ) {
      alert('Please enter valid combustion variables, including Air Humidity (0-100%).');
      return;
    }

    // Prepare data to send to worker
    const data = {
      mixture,
      temperatureC,
      pressureBar,
      fuelFlowRate,
      isMassFlowRate,
      excessAirPercentage,
      flueGasTemperatureC,
      inletAirTemperatureC,
      referenceO2,
      airHumidity
    };

    // Initialize Web Worker
    const worker = new Worker('worker.js');
    worker.postMessage(data);

    worker.onmessage = function(e) {
      const results = e.data;
      if (results.error) {
        alert(`Calculation Error: ${results.error}`);
        output.textContent = '';
        return;
      }

      // Create a section for selected fuels
      let selectedFuels = '=== Selected Fuels ===\n';
      mixture.forEach(component => {
        selectedFuels += `${component.fuel.Name} (${component.fuel.Formula}) - ${component.percentage}%\n`;
      });
      selectedFuels += '\n';

      // Format main results
      const mainResults = `
Average Molar Weight of Fuel Mixture: ${results.totalMolarMass.toFixed(2)} g/mol
Lower Heating Value (LHV): ${results.totalLHV.toFixed(2)} MJ/kg
Higher Heating Value (HHV): ${results.totalHHV.toFixed(2)} MJ/kg

Molar Flow Rate of Fuel: ${results.nFuel.toFixed(4)} mol/s
Molar Flow Rate of Air Required: ${results.nAir.toFixed(4)} mol/s
Required Air Flow Rate: ${results.airFlowRate_m3h.toFixed(2)} m³/h
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

=== Notes ===
- CO ppm represents carbon monoxide emissions from incomplete combustion.
- Other sources of CO (e.g., boiler walls) are not accounted for in this calculator.
- Ensure proper maintenance and operation of combustion systems to minimize CO emissions.
    `;
      
      // Combine selected fuels and main results
      output.textContent = `${selectedFuels}${mainResults}`;
      
      worker.terminate();
    };
  });
});
