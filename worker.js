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
  // Antoine equation constants for water (valid for 1°C to 100°C)
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

    // Ensure total percentage sums to 100%
    let totalPercentage = 0;
    mixture.forEach(component => {
      totalPercentage += component.percentage;
    });
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error('Total fuel percentages must sum up to 100%.');
    }

    // Calculate overall LHV and HHV as weighted averages based on mass fractions
    let totalLHV = 0;
    let totalHHV = 0;
    mixture.forEach(component => {
      const massFraction = component.percentage / 100;
      totalLHV += massFraction * component.fuel.HeatingValue; // Using 'HeatingValue' as LHV
      totalHHV += massFraction * component.fuel.HHV;
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

    // Calculate molar flow rate of fuel
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

    // Calculate stoichiometric air required (for complete combustion)
    // For each fuel component: stoichAir += (C + H/4) mol O2 per mol fuel
    let stoichAir = 0;
    mixture.forEach(component => {
      const fuel = component.fuel;
      stoichAir += (fuel.C + fuel.H / 4) * (component.percentage / 100) * (isMassFlowRate ? fuelFlowRate / 3600 / (fuel.MolarMass / 1000) : fuelFlowRate / 3600 * fuelGasDensity / (fuel.MolarMass / 1000));
    });

    // Adjust for excess air
    const totalO2Required = stoichAir * (1 + excessAirPercentage / 100); // mol O2/s

    // Air has 21% O2 by mole
    const O2_fraction = 0.21;
    const nAir = totalO2Required / O2_fraction; // mol/s

    // Combustion products (assuming complete combustion)
    const nCO2 = nFuel * 1; // mol/s (1 mol CO2 per mol fuel)
    const nH2O = nFuel * 2; // mol/s (2 mol H2O per mol fuel)
    const nSO2 = 0; // Assuming no sulfur in most fuels
    const nUnburnedH2 = 0; // Assuming complete combustion
    const nO2Excess = nAir * O2_fraction - stoichAir; // mol/s
    const nN2 = nAir * (1 - O2_fraction) * 3.76; // mol/s
    const nNOx = 1e-4; // Placeholder value (needs accurate calculation)
    const nAsh = 0; // Assuming no ash for gaseous fuels

    // Flame temperature calculation (simplified)
    const flameTemperatureK = flueGasTemperatureC + 273.15;

    // Calculate SOx emissions (assuming no sulfur in most fuels)
    const SOx_ppm = 0;

    // Calculate Air Flow Rate (m³/h) using Ideal Gas Law
    const airTemperatureK = inletAirTemperatureC + 273.15;
    const airPressurePa = pressureBar * 100000; // bar to Pa
    const airDensity = (airPressurePa * 28.97) / (R * airTemperatureK); // kg/m³ (average molar mass of air: 28.97 g/mol)
    const airFlowRate_m3h = (nAir * R * airTemperatureK) / airPressurePa * 3600; // m³/h

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
      totalMolarMass: totalMolarMass, // g/mol
      totalLHV: totalLHV, // MJ/kg
      totalHHV: totalHHV, // MJ/kg
      nFuel: nFuel, // mol/s
      nAir: nAir, // mol/s
      airFlowRate_m3h: airFlowRate_m3h, // m³/h
      flowRateUnit: isMassFlowRate ? 'kg/h' : 'm³/h',
      flameTemperatureK: flameTemperatureK, // K
      fuelGasDensity: fuelGasDensity, // kg/m³
      nCO2: nCO2, // mol/s
      nH2O: nH2O, // mol/s
      nSO2: nSO2, // mol/s
      nUnburnedH2: nUnburnedH2, // mol/s
      nO2Excess: nO2Excess, // mol/s
      nN2: nN2, // mol/s
      nNOx: nNOx, // mol/s
      nAsh: nAsh, // mol/s
      SOx_ppm: SOx_ppm, // ppm
      volumePercentagesWet: volumePercentagesWet, // %
      volumePercentagesDry: volumePercentagesDry, // %
      NOx_ppm: NOx_ppm, // ppm
      NOx_normalized: NOx_normalized, // mg/Nm³
      NOx_flue_gas_temp: NOx_flue_gas_temp, // mg/Am³
      NOx_corrected_O2_normalized: NOx_corrected_O2_normalized, // mg/Nm³
      NOx_corrected_O2_actual: NOx_corrected_O2_actual, // mg/Am³
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
