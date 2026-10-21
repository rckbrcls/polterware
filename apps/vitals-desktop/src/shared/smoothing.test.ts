import { describe, expect, it } from 'vitest'
import { smoothValue } from './smoothing'

describe('smoothValue', () => {
  it('starts at the first sample', () => {
    expect(smoothValue(null, 42, 1)).toBe(42)
  })

  it('moves part of the way toward a new sample', () => {
    const v = smoothValue(10, 90, 1, 3)
    expect(v).toBeCloseTo(10 + (1 - Math.exp(-1 / 3)) * 80, 6)
    expect(v).toBeGreaterThan(10)
    expect(v).toBeLessThan(90)
  })

  it('weights a longer gap more', () => {
    expect(smoothValue(0, 100, 2, 3)).toBeGreaterThan(smoothValue(0, 100, 1, 3))
  })

  it('resets after a long gap or a bad gap', () => {
    expect(smoothValue(0, 100, 60, 3)).toBe(100)
    expect(smoothValue(0, 100, 0, 3)).toBe(100)
  })
})
