document.addEventListener('DOMContentLoaded', () => {
    const fuelSelectionDiv = document.getElementById('fuel-selection');
    const resultsDiv = document.getElementById('results');
    const parametersForm = document.getElementById('parameters-form');

    // Dynamically create fuel selection inputs
    fuelData.forEach((fuel, index) => {
        const fuelDiv = document.createElement('div');
        fuelDiv.className = 'fuel-item';
        
        const fuelHeader = document.createElement('h3');
        fuelHeader.textContent = `${fuel.Name} (${fuel.Formula})`;
        fuelDiv.appendChild(fuelHeader);
        
        const usedCheckbox = document.createElement('input');
        usedCheckbox.type = 'checkbox';
        usedCheckbox.id = `fuel-used-${index}`;
        usedCheckbox.checked = true;
        fuelDiv.appendChild(usedCheckbox);
        
        const usedLabel = document.createElement('label');
        usedLabel.htmlFor = `fuel-used-${index}`;
        usedLabel.textContent = 'Used';
        fuelDiv.appendChild(usedLabel);
        fuelDiv.appendChild(document.createElement('br'));
        
        const flowRateLabel = document.createElement('label');
        flowRateLabel.htmlFor = `fuel-flow-${index}`;
        flowRateLabel.textContent = fuel.Type === 'Gas' ? 'Flow Rate (m³/h):' : 'Flow Rate (kg/h):';
        fuelDiv.appendChild(flowRateLabel);
        
        const flowRateInput = document.createElement('input');
        flowRateInput.type = 'number';
        flowRateInput.id = `fuel-flow-${index}`;
        flowRateInput.value = 100;
        flowRateInput.required = true;
        fuelDiv.appendChild(flowRateInput);
        fuelDiv.appendChild(document.createElement('br'));

        const burnerPercentageLabel = document.createElement('label');
        burnerPercentageLabel.htmlFor = `fuel-burner-${index}`;
        burnerPercentageLabel.textContent = 'Burner Distribution (%):';
        fuelDiv.appendChild(burnerPercentageLabel);

        const burnerPercentageInput = document.createElement('input');
        burnerPercentageInput.type = 'number';
        burnerPercentageInput.id = `fuel-burner-${index}`;
        burnerPercentageInput.value = 100;
        burnerPercentageInput.required = true;
        fuelDiv.appendChild(burnerPercentageInput);
        fuelDiv.appendChild(document.createElement('br'));

        fuelSelectionDiv.appendChild(fuelDiv);
    });

    parametersForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Gather operational parameters
        const gasPressure = parseFloat(document.getElementById('gas-pressure').value);
        const fuelTemp = parseFloat(document.getElementById('fuel-temp').value);
        const airInletTemp = parseFloat(document.getElementById('air-inlet-temp').value);
        const excessAir = parseFloat(document.getElementById('excess-air').value) / 100;

        // Gather fuel data
        const selectedFuels = [];
        fuelData.forEach((fuel, index) => {
            const used = document.getElementById(`fuel-used-${index}`).checked;
            if (used) {
                const flowRate = parseFloat(document.getElementById(`fuel-flow-${index}`).value);
                const burnerPercentage = parseFloat(document.getElementById(`fuel-burner-${index}`).value) / 100;

                selectedFuels.push({
                    ...fuel,
                    flowRate,
                    burnerPercentage
                });
            }
        });

        // Perform calculations
        const results = calculateCombustion(selectedFuels, gasPressure, fuelTemp, airInletTemp, excessAir);

        // Display results
        displayResults(resultsDiv, results);
    });
});

function calculateCombustion(fuels, gasPressure, fuelTemp, airInletTemp, excessAir) {
    // Constants
    const molarMassAir = 28.97; // Average molar mass of air (g/mol)
    const R = 8.314; // Universal gas constant (J/(mol·K))

    // Placeholder for results
    const results = {
        elementalAnalysis: [],
        combustionProducts: [],
        combined: {}
    };

    fuels.forEach(fuel => {
        // Elemental mass percentages
        const totalAtoms = fuel.C * 12.01 + fuel.H * 1.008 + fuel.O * 16.00 + fuel.N * 14.01 + fuel.S * 32.07;
        const massPercentages = {
            C: (fuel.C * 12.01) / totalAtoms * 100,
            H: (fuel.H * 1.008) / totalAtoms * 100,
            O: (fuel.O * 16.00) / totalAtoms * 100,
            N: (fuel.N * 14.01) / totalAtoms * 100,
            S: (fuel.S * 32.07) / totalAtoms * 100,
            Ash: fuel.AshContent,
            Moisture: fuel.MoistureContent
        };

        // Stoichiometric air requirement (kg/kg)
        const stoichAir = (fuel.C * 12.01 * (32 / 12)) + (fuel.H * 1.008 * (8 / 2)) + (fuel.S * 32.07 * (32 / 32));
        stoichAir = stoichAir / fuel.MolarMass;

        // Adjusted air flow with excess air
        const actualAir = stoichAir * (1 + excessAir);

        // Placeholder for combustion products
        const combustionProducts = {
            CO2: fuel.C * 12.01 * (44 / 12) / fuel.MolarMass,
            H2O: fuel.H * 1.008 * (18 / 2) / fuel.MolarMass,
            SO2: fuel.S * 32.07 * (64 / 32) / fuel.MolarMass,
            N2: actualAir * 0.79,
            O2: actualAir * 0.21 * excessAir
        };

        results.elementalAnalysis.push({
            fuelName: fuel.Name,
            formula: fuel.Formula,
            massPercentages
        });

        results.combustionProducts.push({
            fuelName: fuel.Name,
            combustionProducts
        });
    });

    // Combined results (simplified for demonstration)
    results.combined = {
        elementalMassPercentages: {}, // Sum and average calculations
        combustionProducts: {} // Sum of all combustion products
    };

    return results;
}

function displayResults(container, results) {
    container.innerHTML = '';

    // Display Elemental Mass Percentage Analysis
    const elementalSection = document.createElement('div');
    elementalSection.innerHTML = '<h3>Elemental Mass Percentage Analysis</h3>';
    results.elementalAnalysis.forEach(item => {
        const table = createTableFromObject(item.massPercentages, 'Element', 'Mass Percentage (%)');
        elementalSection.appendChild(document.createElement('h4')).textContent = `${item.fuelName} (${item.formula})`;
        elementalSection.appendChild(table);
    });
    container.appendChild(elementalSection);

    // Display Combustion Products
    const combustionSection = document.createElement('div');
    combustionSection.innerHTML = '<h3>Combustion Products</h3>';
    results.combustionProducts.forEach(item => {
        const table = createTableFromObject(item.combustionProducts, 'Product', 'Amount (kg/kg fuel)');
        combustionSection.appendChild(document.createElement('h4')).textContent = `${item.fuelName} Combustion Products`;
        combustionSection.appendChild(table);
    });
    container.appendChild(combustionSection);

    // Combined Results (if needed)
    // ...
}

function createTableFromObject(obj, col1Header, col2Header) {
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
        cell1.textContent = key;
        const cell2 = document.createElement('td');
        cell2.textContent = obj[key].toFixed(2);
        row.appendChild(cell1);
        row.appendChild(cell2);
        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}
