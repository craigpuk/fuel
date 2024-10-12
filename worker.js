// worker.js

onmessage = function(e) {
  const {
    mixture,
    temperatureC,
    pressureBar,
    gasFlowRateM3h,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2
  } = e.data;

  const results = performCalculations(
    mixture,
    temperatureC,
    pressureBar,
    gasFlowRateM3h,
    excessAirPercentage,
    flueGasTemperatureC,
    referenceO2
  );

  postMessage(results);
};

// Include the performCalculations function and helper functions
function performCalculations(mixture, temperatureC, pressureBar, gasFlowRateM3h, excessAirPercentage, flueGasTemperatureC, referenceO2) {
  // [Copy the performCalculations function from the script.js provided earlier]
  // Due to space constraints, please refer to the performCalculations function in the script.js above.
  // Ensure that all helper functions like calculateFlameTemperature and estimateNOx are included.
}

// Function to calculate flame temperature (simplified)
function calculateFlameTemperature(T_initial, nFuelCombusted, nAir, heatingValuePerMol) {
  // [Same as in script.js]
}

// Function to estimate NOx emissions (ppm) based on flame temperature and excess air
function estimateNOx(flameTemperatureK, excessAirFraction) {
  // [Same as in script.js]
}
