// ✅ Jest setup
require('@testing-library/jest-dom/extend-expect');
require('jest-canvas-mock');
const { server } = require('./mocks/server');

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
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
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen({ target: this });
    }, 100);
  }
  send(data) {
    setTimeout(() => {
      if (this.onmessage)
        this.onmessage({
          data: JSON.stringify({ type: 'echo', payload: JSON.parse(data) }),
        });
    }, 50);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ target: this });
  }
}
global.WebSocket = MockWebSocket;

console.log('✅ Jest environment ready');