import { describe, expect, it } from 'vitest'
import { createIsolation } from '../../src/index'

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createIsolation).toBeDefined()
  })
})
