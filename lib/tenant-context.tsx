'use client'

import { createContext, useContext, useEffect, useState, use} from 'react'
import { useAuth } from './auth-context'
import { supabase } from './supabase-client'

interface Tenant {
  id: string
  name: string
  slug: string
  plan: string
  settings: {
    currency: string
    timezone: string
    date_format: string
  }
}

interface UserTenant {
  tenant_id: string
  role: string
  tenants: Tenant
}

interface TenantContextType {
  currentTenant: Tenant | null
  userTenants: UserTenant[]
  loading: boolean
  switchTenant: (tenantId: string) => void
  refreshTenants: () => Promise<void>
  userRole: string | null
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [userTenants, setUserTenants] = useState<UserTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const { user } = useAuth()

  // Fetch user's tenants
  const fetchUserTenants = async () => {
    if (!user) {
      setUserTenants([])
      setCurrentTenant(null)
      setUserRole(null)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('user_tenants')
        .select(`
          tenant_id,
          role,
          tenants!inner (
            id,
            name,
            slug,
            plan,
            settings
          )
        `)
        .eq('user_id', user.id)

      if (error) throw error

      // Transform the data to match our UserTenant interface
      const userTenantsData = (data || []).map((item: any) => ({
        tenant_id: item.tenant_id,
        role: item.role,
        tenants: Array.isArray(item.tenants) ? item.tenants[0] : item.tenants
      }))

      setUserTenants(userTenantsData as UserTenant[])

      // Set current tenant from localStorage or use first tenant
      const savedTenantId = typeof window !== 'undefined' 
        ? localStorage.getItem('currentTenantId') 
        : null

      if (savedTenantId && userTenantsData.find((ut: UserTenant) => ut.tenant_id === savedTenantId)) {
        const tenant = userTenantsData.find((ut: UserTenant) => ut.tenant_id === savedTenantId)
        if (tenant) {
          setCurrentTenant(tenant.tenants)
          setUserRole(tenant.role)
        }
      } else if (userTenantsData.length > 0) {
        setCurrentTenant(userTenantsData[0].tenants)
        setUserRole(userTenantsData[0].role)
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentTenantId', userTenantsData[0].tenant_id)
        }
      }
    } catch (error) {
      console.error('Error fetching user tenants:', error)
    } finally {
      setLoading(false)
    }
  }

  // Switch tenant
  const switchTenant = (tenantId: string) => {
    const tenant = userTenants.find((ut) => ut.tenant_id === tenantId)
    if (tenant) {
      setCurrentTenant(tenant.tenants)
      setUserRole(tenant.role)
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentTenantId', tenantId)
      }
    }
  }

  // Refresh tenants list
  const refreshTenants = async () => {
    setLoading(true)
    await fetchUserTenants()
  }

  // Load tenants when user changes
  useEffect(() => {
    fetchUserTenants()
  }, [user])

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        userTenants,
        loading,
        switchTenant,
        refreshTenants,
        userRole,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}

