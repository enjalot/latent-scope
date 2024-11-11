describe('Latent Scope App', () => {
  beforeEach(() => {
    // Visit the app before each test
    cy.visit('/')
  })

  afterEach(function() {
    cy.screenshot(this.currentTest.title)
  })

  it('loads the home page successfully', () => {
    // Check that main app container exists
    cy.get('.page').should('exist')

    cy.get('.home').contains('Create new dataset')
    cy.get('.section.datasets').contains('Datasets')
  })

  it('shows navigation menu', () => {
    // Check that navigation exists and contains expected links
    cy.get('nav').should('exist')
  })

  it('can navigate to settings page', () => {
    // Click settings link and verify page loads
    cy.get('a[href="/settings"]').click()
    cy.get('.settings').should('exist')
    cy.get('[class*="_header_"]').should('contain', 'Settings')
  })

  it('displays API settings correctly', () => {
    cy.visit('/settings')
    
    // Check that settings sections exist
    cy.get('[class*="_dot-env_"]').should('exist')
    cy.get('[class*="_data-dir_"]').should('exist')
    cy.get('[class*="_api-keys_"]').should('exist')
  })

  it('can update OpenAI API key', () => {
    cy.visit('/settings')

    // Verify API call was made correctly
    cy.intercept('POST', '/api/settings').as('updateSettings')
    
    // Find the OpenAI API key input
    cy.contains('OPENAI_API_KEY')
      .parent()
      .within(() => {
        // Type the test API key
        cy.get('input[type="password"]').type('test-api-key-123')
        // Submit the form
        cy.get('form').submit()
      })

    // Verify the success state (green checkmark appears)
    cy.contains('OPENAI_API_KEY')
      .parent()
      .should('contain', '✅')

    cy.wait('@updateSettings').then((interception) => {
      expect(interception.request.body).to.have.property('OPENAI_API_KEY', 'test-api-key-123')
    })
  })

  it('handles API errors gracefully', () => {
    // Intercept API call and simulate error
    cy.intercept('GET', '/api/settings', {
      statusCode: 500,
      body: 'Server error'
    })

    cy.visit('/settings')

    // Verify error state is handled
    cy.get('.settings').should('exist')
  })

  it('can create new dataset and see it on homepage', () => {
    // Visit home page
    cy.visit('/')

    // Select and upload file
    cy.get('#upload-button').selectFile('cypress/fixtures/example.csv', { force: true })

    // Dataset name should be auto-populated from filename
    cy.get('#dataset-name').should('have.value', 'example')

    // Submit form 
    cy.get('.new-dataset form button[type="submit"]').click()

    // Wait for redirect after submitting form
    cy.url().should('include', '/setup')

    // Verify setup page shows all required steps
    cy.contains('Embed').should('exist')
    cy.contains('UMAP').should('exist')
    cy.contains('Cluster').should('exist')
    cy.contains('Label Clusters').should('exist')
    cy.contains('Scope').should('exist')
    cy.contains('Select embedding model:').should('exist')

    // Go back to homepage
    cy.visit('/')

    // Verify the new dataset appears in the datasets list
    cy.get('.section.datasets')
      .should('exist')
      .within(() => {
        cy.contains('example').should('exist')
      })
  })
}) 