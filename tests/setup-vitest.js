// tests/setup-vitest.js
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString() },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock
})

// Mock matchMedia
globalThis.matchMedia = globalThis.matchMedia || function() {
  return {
    matches: false,
    addListener: () => {},
    removeListener: () => {}
  }
}

// Mock server for API testing
import { server } from './mocks/server.js'
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

console.log('✅ Vitest test environment setup complete')