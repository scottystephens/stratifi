'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { 
  LayoutDashboard, 
  Wallet, 
  Building2, 
  Send,
  TrendingUp,
  DollarSign,
  Settings,
  ChevronDown,
  Check,
  LogOut,
  Users,
  UserCircle2,
  Database,
  Menu,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/tenant-context'
import { useAuth } from '@/lib/auth-context'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Cash Management', href: '/cash', icon: Wallet },
  { name: 'Entities', href: '/entities', icon: Building2 },
  { name: 'Payments', href: '/payments', icon: Send },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Exchange Rates', href: '/rates', icon: DollarSign },
  { name: 'Connections', href: '/connections', icon: Database },
]

export function Navigation() {
  const pathname = usePathname()
  const { currentTenant, userTenants, switchTenant, userRole } = useTenant()
  const { user, signOut } = useAuth()
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
      "flex h-screen flex-col border-r bg-card transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Logo & Collapse Button */}
      <div className="flex h-16 items-center justify-between border-b px-3">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">T</span>
            </div>
            <span className="text-xl font-bold">TreasuryX</span>
          </Link>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-2 rounded-lg hover:bg-accent transition-colors",
            isCollapsed && "mx-auto"
          )}
          title={isCollapsed ? "Expand menu" : "Collapse menu"}
        >
          {isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </button>
      </div>

      {/* Tenant Switcher */}
      {currentTenant && !isCollapsed && (
        <div className="border-b p-3">
          <button
            onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
            className="flex w-full items-center justify-between rounded-lg bg-accent/50 px-3 py-2 text-sm hover:bg-accent transition-colors"
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
            <div className="mt-2 rounded-lg border bg-card shadow-lg">
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
          <div className="p-2 rounded-lg bg-accent/50">
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
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
        {/* Settings & Team */}
        <div className="p-3 space-y-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
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
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
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
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors"
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
              <div className="mt-2 rounded-lg border bg-card shadow-lg">
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
              className="p-2 rounded-lg hover:bg-accent transition-colors"
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

