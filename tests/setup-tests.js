// tests/setup-tests.js - Fixed Jest setup with proper requires
// Use require() instead of import for Jest compatibility

// Core testing libraries
require('@testing-library/jest-dom/extend-expect');
require('jest-canvas-mock');

// Import mock server
const { server } = require('./mocks/server');

// Establish API mocking before all tests
beforeAll(() => server.listen());

// Reset any request handlers that we may add during the tests
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished
afterAll(() => server.close());

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: key => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia for responsive testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock WebSocket for tests
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Simulate connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen({ target: this });
    }, 100);
  }
  
  send(data) {
    // Simulate server response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          target: this,
          data: JSON.stringify({
            type: 'test_response',
            payload: JSON.parse(data)
          })
        });
      }
    }, 50);
  }
  
  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ target: this });
  }
  
  addEventListener(event, handler) {
    if (event === 'open') this.onopen = handler;
    if (event === 'close') this.onclose = handler;
    if (event === 'message') this.onmessage = handler;
    if (event === 'error') this.onerror = handler;
  }
  
  removeEventListener(event) {
    if (event === 'open') this.onopen = null;
    if (event === 'close') this.onclose = null;
    if (event === 'message') this.onmessage = null;
    if (event === 'error') this.onerror = null;
  }
}

global.WebSocket = MockWebSocket;

console.log('✅ Jest setup completed successfully');