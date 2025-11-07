// Reusable selectors for E2E tests
module.exports = {
  // Auth selectors
  login: {
    email: '#email',
    password: '#password',
    submit: 'button[type="submit"]',
    googleButton: 'button:has-text("Sign in with Google")',
    forgotPassword: 'text=Forgot password?',
    resetEmail: '#reset-email',
    newPassword: '#new-password',
    confirmPassword: '#confirm-password'
  },
  
  // Dashboard selectors
  dashboard: {
    welcomeMessage: 'text=Welcome,',
    userMenu: 'button[aria-label="User menu"]',
    logout: 'text=Logout',
    proposalsLink: 'text=Proposals',
    grantsLink: 'text=Grants',
    systemLink: 'text=System',
    analyticsLink: 'text=Analytics'
  },
  
  // Proposal selectors
  proposals: {
    newButton: 'button:has-text("New Proposal")',
    title: '#title',
    mission: '#mission',
    language: '#language',
    tone: '#tone',
    generateButton: 'button:has-text("Generate Proposal")',
    saveButton: 'button:has-text("Save Draft")',
    submitButton: 'button:has-text("Submit Proposal")',
    voiceTab: 'text=Voice Playback',
    toneTab: 'text=Tone Analysis',
    content: '.proposal-content',
    status: '.proposal-status'
  },
  
  // Grant selectors
  grants: {
    discoverButton: 'button:has-text("Discover Grants")',
    sourceCheckboxes: {
      nsf: 'text=NSF',
      horizon: 'text=Horizon Europe',
      wellcome: 'text=Wellcome Trust'
    },
    startDiscovery: 'button:has-text("Start Discovery")',
    deadlineFrom: 'input[name="deadlineFrom"]',
    deadlineTo: 'input[name="deadlineTo"]',
    amountMin: 'input[name="amountMin"]',
    amountMax: 'input[name="amountMax"]',
    applyFilters: 'button:has-text("Apply Filters")',
    grantItem: '.grant-item',
    grantTitle: '.grant-title',
    deadline: '.deadline',
    amount: '.amount',
    setReminder: 'button:has-text("Set Reminder")',
    remindAt: 'input[name="remindAt"]',
    confirmReminder: 'button:has-text("Confirm Reminder")'
  },
  
  // System selectors
  system: {
    healthMonitor: 'text=Health Monitor',
    chaosControls: 'text=Chaos Controls',
    experimentType: '#experiment-type',
    duration: '#duration',
    startExperiment: 'button:has-text("Start Chaos Experiment")',
    serviceStatus: '.service-status',
    cpuUsage: '.cpu-usage',
    memoryUsage: '.memory-usage'
  },
  
  // Common selectors
  common: {
    successMessage: 'text=successfully',
    errorMessage: '.error-message',
    loadingSpinner: '.loading-spinner',
    retryButton: 'button:has-text("Retry")',
    cancelButton: 'button:has-text("Cancel")',
    confirmButton: 'button:has-text("Confirm")'
  }
};