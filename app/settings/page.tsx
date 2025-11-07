'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { useAuth } from '@/lib/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Loader2, Building2, Save } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { currentTenant, refreshTenants, userRole } = useTenant()
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [organizationName, setOrganizationName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('America/New_York')
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Check permissions
  const canEdit = userRole === 'owner' || userRole === 'admin'

  // Load current settings
  useEffect(() => {
    if (currentTenant) {
      setOrganizationName(currentTenant.name)
      setCurrency(currentTenant.settings.currency)
      setTimezone(currentTenant.settings.timezone)
      setDateFormat(currentTenant.settings.date_format)
    }
  }, [currentTenant])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!canEdit) {
      setError('You do not have permission to update organization settings')
      return
    }

    if (!currentTenant) {
      setError('No organization selected')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase
        .from('tenants')
        .update({
          name: organizationName,
          settings: {
            currency,
            timezone,
            date_format: dateFormat,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentTenant.id)

      if (updateError) throw updateError

      setSuccess('Settings updated successfully')
      await refreshTenants()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error updating settings:', err)
      setError(err.message || 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center">
          <p className="text-gray-600">Please log in to access settings</p>
        </Card>
      </div>
    )
  }

  if (!currentTenant) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading organization...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Organization Settings</h1>
          <p className="text-gray-600 mt-2">Manage your organization details and preferences</p>
        </div>

        {!canEdit && (
          <Card className="mb-6 p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">Read-only access</h3>
                <p className="text-sm text-yellow-800">
                  Only owners and admins can update organization settings.
                </p>
              </div>
            </div>
          </Card>
        )}

        {success && (
          <Card className="mb-6 p-4 bg-green-50 border-green-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">Success</h3>
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          </Card>
        )}

        {error && (
          <Card className="mb-6 p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Error</h3>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">Organization Details</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-2">
                  Organization Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  disabled={!canEdit || loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Acme Corporation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organization Slug
                </label>
                <input
                  type="text"
                  value={currentTenant.slug}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  URL: treasuryx.com/{currentTenant.slug}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plan
                </label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium capitalize">
                    {currentTenant.plan}
                  </span>
                  {currentTenant.plan === 'starter' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => alert('Upgrade feature coming soon!')}
                      disabled={loading}
                    >
                      Upgrade Plan
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-6">Regional Settings</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-2">
                  Default Currency
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={!canEdit || loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="JPY">JPY - Japanese Yen</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="CHF">CHF - Swiss Franc</option>
                  <option value="CNY">CNY - Chinese Yuan</option>
                  <option value="SGD">SGD - Singapore Dollar</option>
                </select>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!canEdit || loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="America/New_York">Eastern Time (New York)</option>
                  <option value="America/Chicago">Central Time (Chicago)</option>
                  <option value="America/Denver">Mountain Time (Denver)</option>
                  <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                  <option value="Asia/Singapore">Singapore</option>
                  <option value="Asia/Hong_Kong">Hong Kong</option>
                  <option value="Australia/Sydney">Sydney</option>
                </select>
              </div>

              <div>
                <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 mb-2">
                  Date Format
                </label>
                <select
                  id="dateFormat"
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  disabled={!canEdit || loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Example: {new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </Card>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

