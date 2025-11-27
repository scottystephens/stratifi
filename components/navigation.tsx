'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { 
  LayoutDashboard, 
  Wallet, 
  Building2,
  DollarSign,
  Settings,
  ChevronDown,
  Check,
  LogOut,
  Users,
  UserCircle2,
  Database,
  Menu,
  X,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/tenant-context'
import { useAuth } from '@/lib/auth-context'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: Wallet },
  { name: 'Entities', href: '/entities', icon: Building2 },
  { name: 'Exchange Rates', href: '/rates', icon: DollarSign },
  { name: 'Connections', href: '/connections', icon: Database },
]

export function Navigation() {
  const pathname = usePathname()
  const { currentTenant, userTenants, switchTenant, userRole } = useTenant()
  const { user, isSuperAdmin, signOut } = useAuth()
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <div className={cn(
      "flex h-screen flex-col border-r border-stone-200 bg-white transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Logo & Collapse Button */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-black text-lg">S</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-stone-900">Strategy</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/dashboard" className="mx-auto">
            <span className="text-primary text-lg font-semibold">S</span>
          </Link>
        )}
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title="Collapse menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {isCollapsed && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute top-4 right-2 p-2 rounded-lg hover:bg-accent transition-colors"
            title="Expand menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tenant Switcher */}
      {currentTenant && !isCollapsed && (
        <div className="border-b p-3">
          <button
            onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
            className="flex w-full items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm hover:bg-stone-100 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 flex-shrink-0 text-primary" />
              <div className="min-w-0 text-left">
                <div className="font-semibold truncate">{currentTenant.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{userRole}</div>
              </div>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 flex-shrink-0 transition-transform",
              tenantMenuOpen && "transform rotate-180"
            )} />
          </button>

          {/* Tenant Dropdown */}
          {tenantMenuOpen && userTenants.length > 1 && (
            <div className="mt-2 rounded-lg border border-stone-200 bg-white shadow-xl">
              <div className="p-2 space-y-1">
                {userTenants.map((userTenant) => (
                  <button
                    key={userTenant.tenant_id}
                    onClick={() => {
                      switchTenant(userTenant.tenant_id)
                      setTenantMenuOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                      currentTenant.id === userTenant.tenant_id && "bg-accent"
                    )}
                  >
                    <div className="text-left">
                      <div className="font-medium">{userTenant.tenants.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{userTenant.role}</div>
                    </div>
                    {currentTenant.id === userTenant.tenant_id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Collapsed Tenant Indicator */}
      {currentTenant && isCollapsed && (
        <div className="border-b p-3 flex justify-center">
          <div className="p-2 rounded-lg bg-stone-50">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
        </div>
      )}
      
      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isCollapsed ? 'justify-center' : 'space-x-3',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Menu */}
      <div className="border-t">
        {/* Admin Link (Super Admins Only) */}
        {isSuperAdmin && (
          <div className="p-3 space-y-1 border-b">
            <Link
              href="/admin"
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isCollapsed ? "justify-center" : "space-x-3",
                pathname?.startsWith('/admin')
                  ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'text-amber-700 hover:bg-amber-50'
              )}
              title={isCollapsed ? "Admin Dashboard" : undefined}
            >
              <Shield className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>Admin Dashboard</span>}
            </Link>
          </div>
        )}

        {/* Settings & Team */}
        <div className="p-3 space-y-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900",
              isCollapsed ? "justify-center" : "space-x-3"
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span>Settings</span>}
          </Link>
          <Link
            href="/team"
            className={cn(
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900",
              isCollapsed ? "justify-center" : "space-x-3"
            )}
            title={isCollapsed ? "Team" : undefined}
          >
            <Users className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span>Team</span>}
          </Link>
        </div>

        {/* User Menu */}
        {user && !isCollapsed && (
          <div className="border-t p-3">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 className="h-5 w-5 flex-shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 flex-shrink-0 transition-transform",
                userMenuOpen && "transform rotate-180"
              )} />
            </button>

            {/* User Dropdown */}
            {userMenuOpen && (
              <div className="mt-2 rounded-lg border border-stone-200 bg-white shadow-xl">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Collapsed User Icon */}
        {user && isCollapsed && (
          <div className="border-t p-3 flex justify-center">
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-stone-50 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5 text-red-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

