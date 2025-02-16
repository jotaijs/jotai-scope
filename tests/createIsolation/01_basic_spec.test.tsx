import { describe, expect, it } from 'vitest'
import { createIsolation } from '../../src/index'

describe('basic spec', () => {
  it('should export functions', function test() {
    expect(createIsolation).toBeDefined()
  })
})
