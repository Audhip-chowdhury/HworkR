import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, getToken, setToken } from '../api/client'

export type User = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  is_platform_admin: boolean
}

export type CompanyMembership = {
  id: string
  user_id: string
  company_id: string
  role: string
  status: string
  modules_access_json: Record<string, unknown> | null
}

export type Company = {
  id: string
  name: string
  logo_url: string | null
  industry: string | null
  location: string | null
  config_json: Record<string, unknown> | null
}

type AuthState = {
  user: User | null
  loading: boolean
  myCompanies: { company: Company; membership: CompanyMembership }[]
}

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [myCompanies, setMyCompanies] = useState<
    { company: Company; membership: CompanyMembership }[]
  >([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setMyCompanies([])
      setLoading(false)
      return
    }
    try {
      const me = await apiFetch<User>('/auth/me')
      setUser(me)
      const companies = await apiFetch<{ company: Company; membership: CompanyMembership }[]>(
        '/me/companies',
      )
      setMyCompanies(companies)
    } catch {
      setToken(null)
      setUser(null)
      setMyCompanies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ access_token: string }>('/auth/login', {
      method: 'POST',
      json: { email, password },
    })
    setToken(res.access_token)
    await refresh()
  }, [refresh])

  const register = useCallback(async (email: string, password: string, name: string) => {
    await apiFetch('/auth/register', {
      method: 'POST',
      json: { email, password, name },
    })
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setMyCompanies([])
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      myCompanies,
      refresh,
      login,
      register,
      logout,
    }),
    [user, loading, myCompanies, refresh, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
