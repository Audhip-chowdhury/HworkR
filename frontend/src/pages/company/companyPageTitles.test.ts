import { describe, expect, it } from 'vitest'
import { companySectionTitle } from './companyPageTitles'

describe('companySectionTitle', () => {
  it('defaults to org', () => {
    expect(companySectionTitle('').title).toContain('Organizational')
  })

  it('detects workflow instance', () => {
    const t = companySectionTitle('workflows/abc-123')
    expect(t.title).toBe('Workflow instance')
  })

  it('maps SSO path', () => {
    expect(companySectionTitle('integrations/sso').title).toContain('SSO')
  })
})
