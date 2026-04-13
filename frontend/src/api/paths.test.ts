import { describe, expect, it } from 'vitest'
import { companyPath } from './paths'

describe('companyPath', () => {
  it('joins company id and suffix', () => {
    expect(companyPath('c1', '/foo')).toBe('/companies/c1/foo')
    expect(companyPath('c1', 'bar')).toBe('/companies/c1/bar')
  })
})
