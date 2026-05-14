import { describe, expect, it } from 'vitest'
import { companySectionTitle } from './companyPageTitles'

describe('companySectionTitle', () => {
  it('defaults to workspace dashboard when path is empty', () => {
    expect(companySectionTitle('').title).toBe('Workspace dashboard')
  })

  it('detects approval detail route', () => {
    const t = companySectionTitle('workflows/abc-123')
    expect(t.title).toBe('Approval')
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

  it('maps audits policy library vs publish from query tab', () => {
    const library = companySectionTitle('audits/policies', '')
    expect(library.title).toBe('Policy library')
    const libraryExplicit = companySectionTitle('audits/policies', '?tab=library')
    expect(libraryExplicit.title).toBe('Policy library')
    const publish = companySectionTitle('audits/policies', '?tab=publish')
    expect(publish.title).toBe('Publish policy')
  })
})
