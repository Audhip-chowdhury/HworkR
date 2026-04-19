import { describe, expect, it } from 'vitest'
import { companySectionTitle } from './companyPageTitles'

describe('companySectionTitle', () => {
  it('defaults to workspace dashboard when path is empty', () => {
    expect(companySectionTitle('').title).toBe('Workspace dashboard')
  })

  it('detects workflow instance', () => {
    const t = companySectionTitle('workflows/abc-123')
    expect(t.title).toBe('Workflow instance')
  })

  it('maps SSO path', () => {
    expect(companySectionTitle('integrations/sso').title).toContain('SSO')
  })

  it('maps my-goals peer review path', () => {
    const t = companySectionTitle('my-goals/peer-review')
    expect(t.title).toBe('Peer review')
  })

  it('maps recruitment tracking path', () => {
    const t = companySectionTitle('recruitment/tracking')
    expect(t.title).toBe('Candidate activity')
  })
})
