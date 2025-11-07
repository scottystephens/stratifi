'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, CheckCircle2, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'

export default function OnboardingPage() {
  const [organizationName, setOrganizationName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const { user } = useAuth()
  const router = useRouter()

  // Generate slug from organization name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  // Handle organization name change
  const handleNameChange = (name: string) => {
    setOrganizationName(name)
    const generatedSlug = generateSlug(name)
    setSlug(generatedSlug)
    setSlugAvailable(null)
  }

  // Check if slug is available
  const checkSlugAvailability = async (slugToCheck: string) => {
    if (!slugToCheck) {
      setSlugAvailable(null)
      return
    }

    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('slug')
        .eq('slug', slugToCheck)
        .single()

      setSlugAvailable(error?.code === 'PGRST116') // Not found = available
    } catch (err) {
      console.error('Error checking slug:', err)
      setSlugAvailable(null)
    }
  }

  // Handle slug change
  const handleSlugChange = (newSlug: string) => {
    setSlug(newSlug)
    checkSlugAvailability(newSlug)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!user) {
      setError('You must be logged in to create an organization')
      return
    }

    if (!organizationName || !slug) {
      setError('Please fill in all fields')
      return
    }

    if (slugAvailable === false) {
      setError('This URL is already taken. Please choose another.')
      return
    }

    setLoading(true)

    try {
      // Create the tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: organizationName,
          slug: slug,
          plan: 'starter',
        })
        .select()
        .single()

      if (tenantError) throw tenantError

      // Add the current user as owner
      const { error: userTenantError } = await supabase
        .from('user_tenants')
        .insert({
          user_id: user.id,
          tenant_id: tenantData.id,
          role: 'owner',
        })

      if (userTenantError) throw userTenantError

      // Success! Redirect to dashboard
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      console.error('Error creating organization:', err)
      setError(err.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-8">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Your Organization</h1>
          <p className="text-gray-600 mt-2">Let&apos;s set up your workspace</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-2">
              Organization Name
            </label>
            <input
              id="orgName"
              type="text"
              value={organizationName}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Acme Corporation"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              This is your company or team name
            </p>
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
              Organization URL
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">treasuryx.com/</span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                onBlur={(e) => checkSlugAvailability(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="acme-corp"
                disabled={loading}
              />
            </div>
            {slugAvailable === true && (
              <div className="mt-2 flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">This URL is available</span>
              </div>
            )}
            {slugAvailable === false && (
              <div className="mt-2 flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs">This URL is already taken</span>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Only lowercase letters, numbers, and hyphens
            </p>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={loading || slugAvailable === false}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating organization...
                </>
              ) : (
                'Create Organization'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 text-sm mb-2">What&apos;s next?</h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• You&apos;ll be set as the owner of this organization</li>
              <li>• You can invite team members later</li>
              <li>• Start with a 14-day free trial on the Professional plan</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}

