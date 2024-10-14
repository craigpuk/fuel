// worker.js

// Universal Gas Constant in J/(mol·K)
const R = 8.314;

// Function to calculate gas density using Ideal Gas Law
function calculateGasDensity(pressureBar, molarMassG, temperatureC) {
  const pressurePa = pressureBar * 100000; // Convert bar to Pascals
  const temperatureK = temperatureC + 273.15; // Convert °C to Kelvin
  const molarMassKg = molarMassG / 1000; // Convert g/mol to kg/mol
  const density = (pressurePa * molarMassKg) / (R * temperatureK); // kg/m³
  return density;
}

// Function to calculate humidity ratio based on air humidity percentage
function calculateHumidityRatio(airHumidity, temperatureC, pressureBar) {
  // Simplified estimation using the Antoine equation for saturation vapor pressure of water
  // Antoine constants for water (valid for 1°C to 100°C)
  const A = 8.07131;
  const B = 1730.63;
  const C = 233.426;
  
  // Calculate saturation vapor pressure in mmHg
  const saturationVaporPressure = 10 ** (A - (B / (temperatureC + C)));
  
  // Convert saturation vapor pressure from mmHg to Pascals
  const saturationVaporPressurePa = saturationVaporPressure * 133.322;
  
  // Actual vapor pressure based on air humidity
  const actualVaporPressurePa = (airHumidity / 100) * saturationVaporPressurePa;
  
  // Total pressure in Pascals
  const totalPressurePa = pressureBar * 100000;
  
  // Humidity ratio (kg H2O / kg dry air)
  const humidityRatio = 0.622 * (actualVaporPressurePa / (totalPressurePa - actualVaporPressurePa));
  
  return humidityRatio;
}

// Function to perform combustion calculations
function performCalculations(data) {
  try {
    const {
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
    } = data;

    // Validate fuel mixture consistency
    const fuelTypes = new Set(mixture.map(component => component.fuel.Type));
    if (fuelTypes.size > 1) {
      throw new Error('Mixed fuel types detected. Only fuels of the same type (Gas, Liquid, or Solid) can be processed together.');
    }

    // Calculate overall LHV and HHV as weighted averages based on mass fractions
    let totalMass = 0;
    mixture.forEach(component => {
      const massFraction = component.percentage / 100;
      totalMass += massFraction;
    });

    let totalLHV = 0;
    let totalHHV = 0;
    mixture.forEach(component => {
      const massFraction = component.percentage / 100;
      totalLHV += massFraction * component.fuel.LoweringHeatingValue;
      totalHHV += massFraction * component.fuel.HeatingValue;
    });

    // Calculate average molar mass of the fuel mixture
    let totalMolarMass = 0;
    mixture.forEach(component => {
      const massFraction = component.percentage / 100;
      totalMolarMass += massFraction * component.fuel.MolarMass;
    });

    // Calculate fuel gas density (only applicable for gaseous fuels)
    let fuelGasDensity = 0;
    if (!isMassFlowRate) { // Only for gaseous fuels
      const fuel = mixture[0].fuel;
      if (!fuel.MolarMass) {
        throw new Error(`Molar mass is undefined for ${fuel.Name}.`);
      }
      fuelGasDensity = calculateGasDensity(pressureBar, fuel.MolarMass, temperatureC);
    }

    // Calculate humidity ratio
    const humidityRatio = calculateHumidityRatio(airHumidity, inletAirTemperatureC, pressureBar);

    // Calculate stoichiometric air required (simplified for CH4)
    // For general fuels, this should be adjusted based on elemental composition
    // Here, we assume complete combustion: CH4 + 2(O2 + 3.76N2) → CO2 + 2H2O + 7.52N2
    let stoichAir = 0;
    mixture.forEach(component => {
      const fuel = component.fuel;
      // Stoichiometric O2 required per mole of fuel (simplified)
      // Adjust based on fuel composition: C + (H/4) = moles of O2 required
      stoichAir += (fuel.C + (fuel.H / 4)) * 1; // moles O2 per mole fuel
    });

    // Adjust for excess air
    const totalAir = stoichAir * (1 + excessAirPercentage / 100);

    // Calculate molar flow rates
    let nFuel = 0;
    mixture.forEach(component => {
      const fuel = component.fuel;
      if (isMassFlowRate) { // kg/h
        const massFlow = (component.percentage / 100) * fuelFlowRate; // kg/h
        const moles = massFlow / (fuel.MolarMass / 1000); // mol/h
        nFuel += moles;
      } else { // m³/h
        const volumeFlow = (component.percentage / 100) * fuelFlowRate; // m³/h
        const massFlow = volumeFlow * fuelGasDensity; // kg/h
        const moles = massFlow / (fuel.MolarMass / 1000); // mol/h
        nFuel += moles;
      }
    });
    nFuel = nFuel / 3600; // Convert to mol/s

    const nAir = totalAir / 3600; // mol/s

    // Combustion products (simplified)
    const nCO2 = nFuel * 1; // mol/s (assuming C fully converts to CO2)
    const nH2O = nFuel * 2; // mol/s (assuming H fully converts to H2O)
    const nSO2 = 0; // Assuming no sulfur in methane or fuels
    const nUnburnedH2 = 0; // Assuming complete combustion
    const nO2Excess = nAir - (nFuel * 1 + nFuel * 2); // mol/s
    const nN2 = nAir * 3.76; // mol/s
    const nNOx = 1e-4; // Placeholder value (needs accurate calculation)
    const nAsh = 0; // Assuming no ash for methane

    // Flame temperature calculation (simplified)
    const flameTemperatureK = flueGasTemperatureC + 273.15;

    // Calculate SOx emissions (assuming no sulfur in methane)
    const SOx_ppm = 0;

    // Volume Percentages (Wet Basis)
    const totalMolesWet = nCO2 + nH2O + nSO2 + nUnburnedH2 + nO2Excess + nN2 + nNOx + nAsh;
    const volumePercentagesWet = {
      CO2: (nCO2 / totalMolesWet) * 100,
      H2O: (nH2O / totalMolesWet) * 100,
      SO2: (nSO2 / totalMolesWet) * 100,
      H2: (nUnburnedH2 / totalMolesWet) * 100,
      O2: (nO2Excess / totalMolesWet) * 100,
      N2: (nN2 / totalMolesWet) * 100,
      NOx: (nNOx / totalMolesWet) * 100,
      Ash: (nAsh / totalMolesWet) * 100
    };

    // Volume Percentages (Dry Basis)
    const totalMolesDry = nCO2 + nSO2 + nUnburnedH2 + nO2Excess + nN2 + nNOx + nAsh;
    const volumePercentagesDry = {
      CO2: (nCO2 / totalMolesDry) * 100,
      SO2: (nSO2 / totalMolesDry) * 100,
      H2: (nUnburnedH2 / totalMolesDry) * 100,
      O2: (nO2Excess / totalMolesDry) * 100,
      N2: (nN2 / totalMolesDry) * 100,
      NOx: (nNOx / totalMolesDry) * 100,
      Ash: (nAsh / totalMolesDry) * 100
    };

    // Advanced NOx Calculations (Placeholder values)
    const NOx_ppm = 37.01; // Example value
    const NOx_normalized = 76.01; // mg/Nm³
    const NOx_flue_gas_temp = 43.87; // mg/Am³
    const NOx_corrected_O2_normalized = 72.40; // mg/Nm³
    const NOx_corrected_O2_actual = 41.79; // mg/Am³

    // Compile results
    const results = {
      totalMolarMass: totalMolarMass,
      totalLHV: totalLHV,
      totalHHV: totalHHV,
      nFuel: nFuel,
      nAir: nAir,
      airFlowRate: totalAir, // mol/s
      flowRateUnit: isMassFlowRate ? 'kg/h' : 'm³/h',
      flameTemperatureK: flameTemperatureK,
      fuelGasDensity: fuelGasDensity,
      nCO2: nCO2,
      nH2O: nH2O,
      nSO2: nSO2,
      nUnburnedH2: nUnburnedH2,
      nO2Excess: nO2Excess,
      nN2: nN2,
      nNOx: nNOx,
      nAsh: nAsh,
      SOx_ppm: SOx_ppm,
      volumePercentagesWet: volumePercentagesWet,
      volumePercentagesDry: volumePercentagesDry,
      NOx_ppm: NOx_ppm,
      NOx_normalized: NOx_normalized,
      NOx_flue_gas_temp: NOx_flue_gas_temp,
      NOx_corrected_O2_normalized: NOx_corrected_O2_normalized,
      NOx_corrected_O2_actual: NOx_corrected_O2_actual,
      CO_ppm: 0.00 // Placeholder since CO calculations are removed
    };

    // Send results back to main thread
    postMessage(results);

  } catch (error) {
    // Send error message back to main thread
    postMessage({ error: error.message });
  }
}

// Listen for messages from main thread
onmessage = function(e) {
  performCalculations(e.data);
};
