import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5174',
    setupNodeEvents(on, config) {
      // implement node event listeners here
      config.env = {
        ...config.env,
        apiUrl: process.env.CYPRESS_API_URL || 'http://localhost:5001'
      }
      return config
    },
    screenshotOnRunFailure: true,
    video: false,
    screenshotsFolder: 'cypress/screenshots',
  },
}) 