// Configuration for the Chrome Extension
const CONFIG = {
  // NOTE: 사지방 dev env is based on vscode tunnel
  BACKEND_URL: 'https://vnw20xbg-8080.asse.devtunnels.ms/',
  API_ENDPOINTS: {
    CONVERT: '/convert',
    HEALTH: '/health'
  }
};

// Make it available globally
window.CONFIG = CONFIG;
