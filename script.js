document.addEventListener('DOMContentLoaded', () => {
    const gasUsedCheckbox = document.getElementById('gas-used');
    const gasInputs = document.getElementById('gas-inputs');

    const solidUsedCheckbox = document.getElementById('solid-used');
    const solidInputs = document.getElementById('solid-inputs');

    const liquidUsedCheckbox = document.getElementById('liquid-used');
    const liquidInputs = document.getElementById('liquid-inputs');

    const fuelForm = document.getElementById('fuel-form');
    const resultsDiv = document.getElementById('results');

    // Show/hide inputs based on whether the fuel type is used
    gasUsedCheckbox.addEventListener('change', () => {
        gasInputs.style.display = gasUsedCheckbox.checked ? 'block' : 'none';
    });

    solidUsedCheckbox.addEventListener('change', () => {
        solidInputs.style.display = solidUsedCheckbox.checked ? 'block' : 'none';
    });

    liquidUsedCheckbox.addEventListener('change', () => {
        liquidInputs.style.display = liquidUsedCheckbox.checked ? 'block' : 'none';
    });

    fuelForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Gather operational parameters
        const gasPressure = parseFloat(document.getElementById('gas-pressure').value);
        const fuelTemp = parseFloat(document.getElementById('fuel-temp').value);
        const airInletTemp = parseFloat(document.getElementById('air-inlet-temp').value);
        const excessAir = parseFloat(document.getElementById('excess-air').value) / 100;

        // Gather fuel data
        const fuels = [];

        if (gasUsedCheckbox.checked) {
            const gasFuel = getFuelData('gas');
            fuels.push(gasFuel);
        }

        if (solidUsedCheckbox.checked) {
            const solidFuel = getFuelData('solid');
            fuels.push(solidFuel);
        }

        if (liquidUsedCheckbox.checked) {
            const liquidFuel = getFuelData('liquid');
            fuels.push(liquidFuel);
        }

        try {
            // Perform calculations
            const results = calculateCombustion(fuels, gasPressure, fuelTemp, airInletTemp, excessAir);

            // Display results
            displayResults(resultsDiv, results);
        } catch (error) {
            alert(error.message);
            console.error(error);
        }
    });
});

function getFuelData(type) {
    const flowRate = parseFloat(document.getElementById(`${type}-flow`).value);
    const carbon = parseFloat(document.getElementById(`${type}-carbon`).value);
    const hydrogen = parseFloat(document.getElementById(`${type}-hydrogen`).value);
    const sulphur = parseFloat(document.getElementById(`${type}-sulphur`).value);
    const nitrogen = parseFloat(document.getElementById(`${type}-nitrogen`).value);
    const oxygen = parseFloat(document.getElementById(`${type}-oxygen`).value);
    const water = parseFloat(document.getElementById(`${type}-water`).value);
    const argon = parseFloat(document.getElementById(`${type}-argon`).value);
    const ash = parseFloat(document.getElementById(`${type}-ash`).value);

    return {
        type: type,
        flowRate: flowRate,
        composition: {
            carbon: carbon,
            hydrogen: hydrogen,
            sulphur: sulphur,
            nitrogen: nitrogen,
            oxygen: oxygen,
            water: water,
            argon: argon,
            ash: ash
        }
    };
}

function calculateCombustion(fuels, gasPressure, fuelTemp, airInletTemp, excessAir) {
    const results = {
        elementalAnalysis: [],
        combustionProducts: [],
        calorificValues: [],
        combined: {}
    };

    fuels.forEach(fuel => {
        const massPercentages = fuel.composition;

        // Validate that the sum of percentages is approximately 100%
        const totalPercentage = Object.values(massPercentages).reduce((sum, val) => sum + val, 0);
        if (Math.abs(totalPercentage - 100) > 1) {
            throw new Error(`The total elemental percentages for ${fuel.type} fuel do not add up to 100%. Total is ${totalPercentage.toFixed(2)}%.`);
        }

        // Normalize percentages to exactly 100% for calculations
        const normalizationFactor = 100 / totalPercentage;
        for (let key in massPercentages) {
            massPercentages[key] *= normalizationFactor;
        }

        // Convert percentages to fractions
        const C = massPercentages.carbon / 100;
        const H = massPercentages.hydrogen / 100;
        const S = massPercentages.sulphur / 100;
        const O = massPercentages.oxygen / 100;
        const N = massPercentages.nitrogen / 100;
        const Ash = massPercentages.ash / 100;
        const Moisture = massPercentages.water / 100;

        // Calculate GCV and NCV using Dulong's formula (in MJ/kg)
        const GCV = (0.3383 * massPercentages.carbon) + (1.442 * (massPercentages.hydrogen - (massPercentages.oxygen / 8))) + (0.0942 * massPercentages.sulphur);
        const NCV = GCV - (2.442 * H * 100);

        // Stoichiometric oxygen required (kg O2/kg fuel)
        const O2_required = (C * (32 / 12)) + (H * (8 / 2)) + (S * (32 / 32)) - O;
        // Stoichiometric air required (kg air/kg fuel)
        const StoichAir = O2_required / 0.233; // Assuming air has 23.3% oxygen by mass

        // Actual air with excess air
        const ActualAir = StoichAir * (1 + excessAir);

        // Combustion products (kg/kg fuel)
        const CO2 = C * (44 / 12);
        const H2O = H * (9 / 1);
        const SO2 = S * (64 / 32);
        const ExcessO2 = ActualAir * 0.233 - O2_required;
        const N2_from_air = ActualAir * 0.767; // Assuming air has 76.7% nitrogen by mass
        const N2 = N + N2_from_air;

        // Total flue gas mass (kg/kg fuel)
        const TotalFlueGas = CO2 + H2O + SO2 + ExcessO2 + N2 + Ash + Moisture;

        // Dry flue gas mass (kg/kg fuel)
        const DryFlueGas = TotalFlueGas - H2O - Moisture;

        // Molar amounts (kmol/kg fuel)
        const n_CO2 = CO2 / 44;
        const n_H2O = H2O / 18;
        const n_SO2 = SO2 / 64;
        const n_O2 = ExcessO2 / 32;
        const n_N2 = N2 / 28;

        const TotalMolesWet = n_CO2 + n_H2O + n_SO2 + n_O2 + n_N2;
        const TotalMolesDry = TotalMolesWet - n_H2O;

        // Volume (Nm³/kg fuel)
        const MolarVolume = 22.414; // Nm³/kmol at NTP
        const WetFlueGasVolume = TotalMolesWet * MolarVolume;
        const DryFlueGasVolume = TotalMolesDry * MolarVolume;

        // Volume percentages (wet)
        const vol_CO2_wet = (n_CO2 / TotalMolesWet) * 100;
        const vol_H2O_wet = (n_H2O / TotalMolesWet) * 100;
        const vol_SO2_wet = (n_SO2 / TotalMolesWet) * 100;
        const vol_O2_wet = (n_O2 / TotalMolesWet) * 100;
        const vol_N2_wet = (n_N2 / TotalMolesWet) * 100;

        // Volume percentages (dry)
        const vol_CO2_dry = (n_CO2 / TotalMolesDry) * 100;
        const vol_SO2_dry = (n_SO2 / TotalMolesDry) * 100;
        const vol_O2_dry = (n_O2 / TotalMolesDry) * 100;
        const vol_N2_dry = (n_N2 / TotalMolesDry) * 100;

        results.elementalAnalysis.push({
            fuelType: capitalizeFirstLetter(fuel.type),
            massPercentages
        });

        results.combustionProducts.push({
            fuelType: capitalizeFirstLetter(fuel.type),
            combustionProducts: {
                CO2: CO2.toFixed(3),
                H2O: H2O.toFixed(3),
                SO2: SO2.toFixed(3),
                O2: ExcessO2.toFixed(3),
                N2: N2.toFixed(3),
                Ash: Ash.toFixed(3),
                TotalFlueGas: TotalFlueGas.toFixed(3),
                DryFlueGas: DryFlueGas.toFixed(3)
            },
            flueGasVolumes: {
                WetVolume: WetFlueGasVolume.toFixed(3),
                DryVolume: DryFlueGasVolume.toFixed(3)
            },
            volumePercentages: {
                wet: {
                    CO2: vol_CO2_wet.toFixed(2),
                    H2O: vol_H2O_wet.toFixed(2),
                    SO2: vol_SO2_wet.toFixed(2),
                    O2: vol_O2_wet.toFixed(2),
                    N2: vol_N2_wet.toFixed(2)
                },
                dry: {
                    CO2: vol_CO2_dry.toFixed(2),
                    SO2: vol_SO2_dry.toFixed(2),
                    O2: vol_O2_dry.toFixed(2),
                    N2: vol_N2_dry.toFixed(2)
                }
            },
            airFuelRatio: {
                StoichiometricAir: StoichAir.toFixed(3),
                ActualAir: ActualAir.toFixed(3)
            }
        });

        results.calorificValues.push({
            fuelType: capitalizeFirstLetter(fuel.type),
            GCV: GCV.toFixed(2),
            NCV: NCV.toFixed(2)
        });
    });

    // Combined results
    results.combined = combineResults(fuels, results);

    return results;
}

function combineResults(fuels, results) {
    const combined = {
        elementalMassPercentages: {},
        combustionProducts: {},
        calorificValues: {},
        flueGasVolumes: {},
        volumePercentages: {},
        airFuelRatio: {}
    };

    const totalFlowRate = fuels.reduce((sum, fuel) => sum + fuel.flowRate, 0);

    const elements = ['carbon', 'hydrogen', 'sulphur', 'nitrogen', 'oxygen', 'water', 'argon', 'ash'];
    const products = ['CO2', 'H2O', 'SO2', 'O2', 'N2', 'Ash'];
    const volumes = ['WetVolume', 'DryVolume'];
    const airRatios = ['StoichiometricAir', 'ActualAir'];

    // Initialize combined percentages
    elements.forEach(element => {
        combined.elementalMassPercentages[element] = 0;
    });

    products.forEach(product => {
        combined.combustionProducts[product] = 0;
    });

    volumes.forEach(volume => {
        combined.flueGasVolumes[volume] = 0;
    });

    airRatios.forEach(ratio => {
        combined.airFuelRatio[ratio] = 0;
    });

    let totalGCV = 0;
    let totalNCV = 0;

    results.elementalAnalysis.forEach((analysis, index) => {
        const fuel = fuels[index];
        const weightFactor = fuel.flowRate / totalFlowRate;
        elements.forEach(element => {
            combined.elementalMassPercentages[element] += analysis.massPercentages[element] * weightFactor;
        });

        // Calorific values
        const GCV = parseFloat(results.calorificValues[index].GCV);
        const NCV = parseFloat(results.calorificValues[index].NCV);
        totalGCV += GCV * weightFactor;
        totalNCV += NCV * weightFactor;

        // Air-to-fuel ratios
        airRatios.forEach(ratio => {
            combined.airFuelRatio[ratio] += parseFloat(results.combustionProducts[index].airFuelRatio[ratio]) * weightFactor;
        });
    });

    results.combustionProducts.forEach((productData, index) => {
        const fuel = fuels[index];
        const weightFactor = fuel.flowRate / totalFlowRate;
        products.forEach(product => {
            combined.combustionProducts[product] += parseFloat(productData.combustionProducts[product]) * weightFactor;
        });

        volumes.forEach(volume => {
            combined.flueGasVolumes[volume] += parseFloat(productData.flueGasVolumes[volume]) * weightFactor;
        });
    });

    combined.calorificValues.GCV = totalGCV.toFixed(2);
    combined.calorificValues.NCV = totalNCV.toFixed(2);

    return combined;
}

function displayResults(container, results) {
    container.innerHTML = '';

    // Display Elemental Mass Percentage Analysis
    const elementalSection = document.createElement('div');
    elementalSection.className = 'result-section';
    elementalSection.innerHTML = '<h3>Elemental Mass Percentage Analysis</h3>';
    results.elementalAnalysis.forEach(item => {
        const table = createTableFromObject(item.massPercentages, 'Element', 'Mass Percentage (%)', true);
        const heading = document.createElement('h4');
        heading.textContent = `${item.fuelType} Fuel`;
        elementalSection.appendChild(heading);
        elementalSection.appendChild(table);
    });
    container.appendChild(elementalSection);

    // Display Calorific Values
    const calorificSection = document.createElement('div');
    calorificSection.className = 'result-section';
    calorificSection.innerHTML = '<h3>Calorific Values</h3>';
    results.calorificValues.forEach(item => {
        const table = createCalorificTable(item);
        calorificSection.appendChild(table);
    });
    container.appendChild(calorificSection);

    // Display Combustion Products
    const combustionSection = document.createElement('div');
    combustionSection.className = 'result-section';
    combustionSection.innerHTML = '<h3>Combustion Products</h3>';
    results.combustionProducts.forEach(item => {
        const heading = document.createElement('h4');
        heading.textContent = `${item.fuelType} Fuel Combustion Products`;
        combustionSection.appendChild(heading);

        const productsTable = createTableFromObject(item.combustionProducts, 'Product', 'Amount (kg/kg fuel)', true);
        combustionSection.appendChild(productsTable);

        const volumesTable = createTableFromObject(item.flueGasVolumes, 'Parameter', 'Value (Nm³/kg fuel)', false);
        combustionSection.appendChild(volumesTable);

        const airFuelRatioTable = createTableFromObject(item.airFuelRatio, 'Parameter', 'Value (kg air/kg fuel)', false);
        combustionSection.appendChild(airFuelRatioTable);

        const volumePercentagesWet = createTableFromObject(item.volumePercentages.wet, 'Component', 'Wet Volume (%)', true);
        combustionSection.appendChild(volumePercentagesWet);

        const volumePercentagesDry = createTableFromObject(item.volumePercentages.dry, 'Component', 'Dry Volume (%)', true);
        combustionSection.appendChild(volumePercentagesDry);
    });
    container.appendChild(combustionSection);

    // Display Combined Results
    const combinedSection = document.createElement('div');
    combinedSection.className = 'result-section';
    combinedSection.innerHTML = '<h3>Combined Results</h3>';

    const combinedElementalHeading = document.createElement('h4');
    combinedElementalHeading.textContent = 'Combined Elemental Mass Percentages';
    combinedSection.appendChild(combinedElementalHeading);
    const combinedElementalTable = createTableFromObject(results.combined.elementalMassPercentages, 'Element', 'Mass Percentage (%)', true);
    combinedSection.appendChild(combinedElementalTable);

    const combinedCalorificHeading = document.createElement('h4');
    combinedCalorificHeading.textContent = 'Combined Calorific Values';
    combinedSection.appendChild(combinedCalorificHeading);
    const combinedCalorificTable = createCalorificTable({
        fuelType: 'Combined Fuel Mix',
        GCV: results.combined.calorificValues.GCV,
        NCV: results.combined.calorificValues.NCV
    });
    combinedSection.appendChild(combinedCalorificTable);

    const combinedCombustionHeading = document.createElement('h4');
    combinedCombustionHeading.textContent = 'Combined Combustion Products';
    combinedSection.appendChild(combinedCombustionHeading);
    const combinedCombustionTable = createTableFromObject(results.combined.combustionProducts, 'Product', 'Amount (kg/kg fuel)', true);
    combinedSection.appendChild(combinedCombustionTable);

    const combinedVolumesTable = createTableFromObject(results.combined.flueGasVolumes, 'Parameter', 'Value (Nm³/kg fuel)', false);
    combinedSection.appendChild(combinedVolumesTable);

    const combinedAirFuelRatioTable = createTableFromObject(results.combined.airFuelRatio, 'Parameter', 'Value (kg air/kg fuel)', false);
    combinedSection.appendChild(combinedAirFuelRatioTable);

    container.appendChild(combinedSection);
}

function createTableFromObject(obj, col1Header, col2Header, useChemicalSymbols) {
    const table = document.createElement('table');
    table.className = 'result-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const col1 = document.createElement('th');
    col1.textContent = col1Header;
    const col2 = document.createElement('th');
    col2.textContent = col2Header;
    headerRow.appendChild(col1);
    headerRow.appendChild(col2);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const key in obj) {
        const row = document.createElement('tr');
        const cell1 = document.createElement('td');
        cell1.innerHTML = useChemicalSymbols ? formatChemicalSymbol(key) : key;
        const cell2 = document.createElement('td');
        cell2.textContent = parseFloat(obj[key]).toFixed(3);
        row.appendChild(cell1);
        row.appendChild(cell2);
        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}

function createCalorificTable(data) {
    const table = document.createElement('table');
    table.className = 'result-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const col1 = document.createElement('th');
    col1.textContent = 'Fuel Type';
    const col2 = document.createElement('th');
    col2.textContent = 'GCV (MJ/kg)';
    const col3 = document.createElement('th');
    col3.textContent = 'NCV (MJ/kg)';
    headerRow.appendChild(col1);
    headerRow.appendChild(col2);
    headerRow.appendChild(col3);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    const cell1 = document.createElement('td');
    cell1.textContent = data.fuelType;
    const cell2 = document.createElement('td');
    cell2.textContent = data.GCV;
    const cell3 = document.createElement('td');
    cell3.textContent = data.NCV;
    row.appendChild(cell1);
    row.appendChild(cell2);
    row.appendChild(cell3);
    tbody.appendChild(row);
    table.appendChild(tbody);

    return table;
}

function formatChemicalSymbol(symbol) {
    const symbolMap = {
        carbon: 'C',
        hydrogen: 'H',
        sulphur: 'S',
        nitrogen: 'N',
        oxygen: 'O',
        water: 'H₂O',
        argon: 'Ar',
        ash: 'Ash',
        CO2: 'CO₂',
        H2O: 'H₂O',
        SO2: 'SO₂',
        O2: 'O₂',
        N2: 'N₂',
        Ash: 'Ash'
    };
    return symbolMap[symbol] || symbol;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
