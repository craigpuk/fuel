/* styles.css */

body {
  font-family: Arial, sans-serif;
  margin: 20px;
  background-color: #f5f5f5;
}

h1, h2, h3 {
  color: #333;
}

label {
  display: inline-block;
  width: 220px;
  margin-top: 10px;
  font-weight: bold;
}

input {
  width: 150px;
  padding: 5px;
  margin-top: 10px;
}

button {
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  cursor: pointer;
}

button:hover {
  background-color: #45a049;
}

#fuel-selection, #combustion-variables, #results {
  background-color: white;
  padding: 20px;
  margin-bottom: 40px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

.fuel-item {
  margin-bottom: 10px;
}

.fuel-item select, .fuel-item input {
  margin-right: 10px;
  padding: 5px;
}

.fuel-item button {
  background-color: #f44336;
}

.fuel-item button:hover {
  background-color: #da190b;
}

pre {
  background-color: #eef;
  padding: 15px;
  border-radius: 5px;
  overflow: auto;
}

/* Responsive Design */
@media (max-width: 600px) {
  label, input {
    width: 100%;
    display: block;
  }

  .fuel-item select, .fuel-item input {
    width: 100%;
    margin-bottom: 10px;
  }

  button {
    width: 100%;
  }
}
