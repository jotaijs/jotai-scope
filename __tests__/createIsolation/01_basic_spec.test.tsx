import { createIsolation } from 'src'

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createIsolation).toBeDefined()
  })
})
