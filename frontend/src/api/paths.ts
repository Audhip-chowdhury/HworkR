/** REST paths under `/api/v1` (apiFetch prepends API_BASE). */
export function companyPath(companyId: string, suffix: string): string {
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `/companies/${companyId}${s}`
}
