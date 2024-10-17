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

        // Perform calculations
        const results = calculateCombustion(fuels, gasPressure, fuelTemp, airInletTemp, excessAir);

        // Display results
        displayResults(resultsDiv, results);
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
    // Placeholder for results
    const results = {
        elementalAnalysis: [],
        combustionProducts: [],
        combined: {}
    };

    fuels.forEach(fuel => {
        // Validate that the sum of percentages is 100%
        const totalPercentage = Object.values(fuel.composition).reduce((sum, val) => sum + val, 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
            alert(`The total elemental percentages for ${fuel.type} fuel do not add up to 100%.`);
            throw new Error(`Invalid elemental percentages for ${fuel.type} fuel.`);
        }

        // Elemental mass percentages
        const massPercentages = fuel.composition;

        // Stoichiometric air requirement (kg/kg)
        // Calculated based on combustion reactions
        const stoichAir = (
            (massPercentages.carbon / 100) * (32 / 12) +
            (massPercentages.hydrogen / 100) * (8 / 2) +
            (massPercentages.sulphur / 100) * (32 / 32)
        );

        // Adjusted air flow with excess air
        const actualAir = stoichAir * (1 + excessAir);

        // Combustion products per kg of fuel
        const combustionProducts = {
            CO2: (massPercentages.carbon / 100) * (44 / 12),
            H2O: (massPercentages.hydrogen / 100) * (9 / 2),
            SO2: (massPercentages.sulphur / 100) * (64 / 32),
            N2: (actualAir * 0.79) + (massPercentages.nitrogen / 100),
            O2: actualAir * 0.21 * excessAir,
            Ash: massPercentages.ash / 100
        };

        results.elementalAnalysis.push({
            fuelType: fuel.type.charAt(0).toUpperCase() + fuel.type.slice(1),
            massPercentages
        });

        results.combustionProducts.push({
            fuelType: fuel.type.charAt(0).toUpperCase() + fuel.type.slice(1),
            combustionProducts
        });
    });

    // Combined results
    results.combined = combineResults(fuels, results);

    return results;
}

function combineResults(fuels, results) {
    // Combine the elemental mass percentages and combustion products
    const combined = {
        elementalMassPercentages: {},
        combustionProducts: {}
    };

    // Initialize sums
    const totalFlowRate = fuels.reduce((sum, fuel) => sum + fuel.flowRate, 0);

    const elements = ['carbon', 'hydrogen', 'sulphur', 'nitrogen', 'oxygen', 'water', 'argon', 'ash'];
    const products = ['CO2', 'H2O', 'SO2', 'N2', 'O2', 'Ash'];

    // Initialize combined percentages
    elements.forEach(element => {
        combined.elementalMassPercentages[element] = 0;
    });

    products.forEach(product => {
        combined.combustionProducts[product] = 0;
    });

    // Weighted average of elemental mass percentages
    results.elementalAnalysis.forEach((analysis, index) => {
        const fuel = fuels[index];
        const weightFactor = fuel.flowRate / totalFlowRate;
        elements.forEach(element => {
            combined.elementalMassPercentages[element] += analysis.massPercentages[element] * weightFactor;
        });
    });

    // Sum of combustion products
    results.combustionProducts.forEach((productData) => {
        products.forEach(product => {
            combined.combustionProducts[product] += productData.combustionProducts[product];
        });
    });

    return combined;
}

function displayResults(container, results) {
    container.innerHTML = '';

    // Display Elemental Mass Percentage Analysis
    const elementalSection = document.createElement('div');
    elementalSection.innerHTML = '<h3>Elemental Mass Percentage Analysis</h3>';
    results.elementalAnalysis.forEach(item => {
        const table = createTableFromObject(item.massPercentages, 'Element', 'Mass Percentage (%)', true);
        elementalSection.appendChild(document.createElement('h4')).textContent = `${item.fuelType} Fuel`;
        elementalSection.appendChild(table);
    });
    container.appendChild(elementalSection);

    // Display Combustion Products
    const combustionSection = document.createElement('div');
    combustionSection.innerHTML = '<h3>Combustion Products</h3>';
    results.combustionProducts.forEach(item => {
        const table = createTableFromObject(item.combustionProducts, 'Product', 'Amount (kg/kg fuel)', true);
        combustionSection.appendChild(document.createElement('h4')).textContent = `${item.fuelType} Fuel Combustion Products`;
        combustionSection.appendChild(table);
    });
    container.appendChild(combustionSection);

    // Display Combined Results
    const combinedSection = document.createElement('div');
    combinedSection.innerHTML = '<h3>Combined Results</h3>';

    combinedSection.appendChild(document.createElement('h4')).textContent = 'Combined Elemental Mass Percentages';
    const combinedElementalTable = createTableFromObject(results.combined.elementalMassPercentages, 'Element', 'Mass Percentage (%)', true);
    combinedSection.appendChild(combinedElementalTable);

    combinedSection.appendChild(document.createElement('h4')).textContent = 'Combined Combustion Products';
    const combinedCombustionTable = createTableFromObject(results.combined.combustionProducts, 'Product', 'Amount', true);
    combinedSection.appendChild(combinedCombustionTable);

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
        cell2.textContent = obj[key].toFixed(2);
        row.appendChild(cell1);
        row.appendChild(cell2);
        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}

function formatChemicalSymbol(symbol) {
    // Map for chemical symbols
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
        N2: 'N₂',
        O2: 'O₂',
        Ash: 'Ash'
    };
    return symbolMap[symbol] || symbol;
}
