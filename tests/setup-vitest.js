// ✅ Vitest setup
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { server } from './mocks/server.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock matchMedia
globalThis.matchMedia = globalThis.matchMedia || (() => ({
  matches: false,
  addListener: () => {},
  removeListener: () => {},
}));

// Mock WebSocket
globalThis.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.({ target: this });
    }, 100);
  }
  send(data) {
    setTimeout(() => {
      this.onmessage?.({
        data: JSON.stringify({ type: 'echo', payload: JSON.parse(data) }),
      });
    }, 50);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ target: this });
  }
};

// Mock server for API tests
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

console.log('✅ Vitest environment ready');