// tests/simple-typescript.test.ts
import { describe, test, expect } from 'vitest'

describe('TypeScript configuration', () => {
  interface TestInterface {
    name: string;
    value: number;
  }

  test('adds 1 + 2 to equal 3', () => {
    expect(1 + 2).toBe(3)
  })

  test('handles TypeScript interfaces correctly', () => {
    const testObject: TestInterface = {
      name: 'test',
      value: 42
    }
    
    expect(testObject.name).toBe('test')
    expect(testObject.value).toBe(42)
  })

  test('mocks localStorage correctly', () => {
    localStorage.setItem('testKey', 'testValue')
    expect(localStorage.getItem('testKey')).toBe('testValue')
    localStorage.removeItem('testKey')
    expect(localStorage.getItem('testKey')).toBeNull()
  })
})