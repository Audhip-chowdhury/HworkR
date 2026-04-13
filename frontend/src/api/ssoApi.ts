import { apiFetch } from './client'
import type { OidcAuthorizeStubResponse, SsoProviderInfo } from './types'

export function listSsoProviders() {
  return apiFetch<SsoProviderInfo[]>('/auth/sso/providers')
}

export function getGoogleOidcStub() {
  return apiFetch<OidcAuthorizeStubResponse>('/auth/sso/google/authorize')
}
