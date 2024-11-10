// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Track console errors
let consoleErrors = [];

Cypress.on('window:console', (msg) => {
  if (msg.type === 'error') {
    consoleErrors.push(msg);
  }
});

// Clear errors before each test
beforeEach(() => {
  consoleErrors = [];
});

// Check for errors after each test
afterEach(() => {
  if (consoleErrors.length > 0) {
    const errorMessages = consoleErrors.map(error => error.message || error).join('\n');
    throw new Error(`Console errors detected:\n${errorMessages}`);
  }
});

// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })

// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })

// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })

// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })