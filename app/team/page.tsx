'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { useAuth } from '@/lib/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Users, 
  Mail, 
  UserPlus,
  Trash2,
  Crown,
  Shield,
  Edit,
  Eye
} from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

interface TeamMember {
  user_id: string
  role: string
  created_at: string
  users: {
    email: string
  }
}

interface Invitation {
  id: string
  email: string
  role: string
  invited_by: string
  expires_at: string
  created_at: string
}

export default function TeamPage() {
  const { currentTenant, userRole } = useTenant()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Check permissions
  const canManageTeam = userRole === 'owner' || userRole === 'admin'

  // Fetch team members and invitations
  const fetchTeamData = async () => {
    if (!currentTenant) return

    setLoading(true)
    try {
      // Fetch team members
      const { data: membersData, error: membersError } = await supabase
        .from('user_tenants')
        .select(`
          user_id,
          role,
          created_at,
          users:user_id (
            email
          )
        `)
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: true })

      if (membersError) throw membersError

      // Transform the data
      const transformedMembers = (membersData || []).map((item: any) => ({
        user_id: item.user_id,
        role: item.role,
        created_at: item.created_at,
        users: Array.isArray(item.users) ? item.users[0] : item.users
      }))

      setTeamMembers(transformedMembers as TeamMember[])

      // Fetch pending invitations
      const { data: invitesData, error: invitesError } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (invitesError) throw invitesError

      setInvitations(invitesData as Invitation[])
    } catch (err: any) {
      console.error('Error fetching team data:', err)
      setError(err.message || 'Failed to load team data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeamData()
  }, [currentTenant])

  // Send invitation
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!canManageTeam) {
      setError('You do not have permission to invite team members')
      return
    }

    if (!currentTenant || !user) return

    setActionLoading('invite')

    try {
      // Generate invitation token
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

      const { error: inviteError } = await supabase
        .from('team_invitations')
        .insert({
          tenant_id: currentTenant.id,
          email: inviteEmail,
          role: inviteRole,
          invited_by: user.id,
          token,
          expires_at: expiresAt.toISOString(),
        })

      if (inviteError) throw inviteError

      setSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('viewer')
      setShowInviteForm(false)
      
      // Refresh data
      await fetchTeamData()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error sending invitation:', err)
      setError(err.message || 'Failed to send invitation')
    } finally {
      setActionLoading(null)
    }
  }

  // Update member role
  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!canManageTeam) {
      setError('You do not have permission to update roles')
      return
    }

    if (!currentTenant) return

    // Prevent owner from changing their own role
    if (userId === user?.id && userRole === 'owner') {
      setError('Owners cannot change their own role')
      return
    }

    setActionLoading(`role-${userId}`)
    setError(null)
    setSuccess(null)

    try {
      const { error: updateError } = await supabase
        .from('user_tenants')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('tenant_id', currentTenant.id)

      if (updateError) throw updateError

      setSuccess('Role updated successfully')
      await fetchTeamData()

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error updating role:', err)
      setError(err.message || 'Failed to update role')
    } finally {
      setActionLoading(null)
    }
  }

  // Remove team member
  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!canManageTeam) {
      setError('You do not have permission to remove team members')
      return
    }

    if (!currentTenant) return

    // Prevent removing yourself if you're the owner
    if (userId === user?.id && userRole === 'owner') {
      setError('Owners cannot remove themselves')
      return
    }

    if (!confirm(`Are you sure you want to remove ${userEmail} from the team?`)) {
      return
    }

    setActionLoading(`remove-${userId}`)
    setError(null)
    setSuccess(null)

    try {
      const { error: removeError } = await supabase
        .from('user_tenants')
        .delete()
        .eq('user_id', userId)
        .eq('tenant_id', currentTenant.id)

      if (removeError) throw removeError

      setSuccess(`Removed ${userEmail} from the team`)
      await fetchTeamData()

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error removing member:', err)
      setError(err.message || 'Failed to remove team member')
    } finally {
      setActionLoading(null)
    }
  }

  // Cancel invitation
  const handleCancelInvite = async (inviteId: string, email: string) => {
    if (!canManageTeam) return

    if (!confirm(`Cancel invitation for ${email}?`)) return

    setActionLoading(`cancel-${inviteId}`)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('team_invitations')
        .delete()
        .eq('id', inviteId)

      if (deleteError) throw deleteError

      setSuccess('Invitation cancelled')
      await fetchTeamData()

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error cancelling invitation:', err)
      setError(err.message || 'Failed to cancel invitation')
    } finally {
      setActionLoading(null)
    }
  }

  // Role icon and color
  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'owner':
        return { icon: Crown, color: 'text-yellow-600 bg-yellow-100', label: 'Owner' }
      case 'admin':
        return { icon: Shield, color: 'text-purple-600 bg-purple-100', label: 'Admin' }
      case 'editor':
        return { icon: Edit, color: 'text-blue-600 bg-blue-100', label: 'Editor' }
      case 'viewer':
        return { icon: Eye, color: 'text-gray-600 bg-gray-100', label: 'Viewer' }
      default:
        return { icon: Users, color: 'text-gray-600 bg-gray-100', label: role }
    }
  }

  if (!user) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center">
          <p className="text-gray-600">Please log in to access team management</p>
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
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
            <p className="text-gray-600 mt-2">Manage team members and their roles</p>
          </div>
          {canManageTeam && (
            <Button
              onClick={() => setShowInviteForm(!showInviteForm)}
              disabled={loading}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          )}
        </div>

        {!canManageTeam && (
          <Card className="mb-6 p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">Limited access</h3>
                <p className="text-sm text-yellow-800">
                  Only owners and admins can invite or manage team members.
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

        {/* Invite Form */}
        {showInviteForm && canManageTeam && (
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Invite Team Member</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={actionLoading === 'invite'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="colleague@company.com"
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  disabled={actionLoading === 'invite'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="viewer">Viewer - Can view data only</option>
                  <option value="editor">Editor - Can edit data</option>
                  <option value="admin">Admin - Can manage team and data</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={actionLoading === 'invite'}
                >
                  {actionLoading === 'invite' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowInviteForm(false)
                    setInviteEmail('')
                    setInviteRole('viewer')
                  }}
                  disabled={actionLoading === 'invite'}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Team Members */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold">Team Members ({teamMembers.length})</h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">Loading team members...</p>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No team members yet
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member) => {
                const roleDisplay = getRoleDisplay(member.role)
                const RoleIcon = roleDisplay.icon
                const isCurrentUser = member.user_id === user.id

                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {member.users.email[0].toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">
                            {member.users.email}
                          </p>
                          {isCurrentUser && (
                            <span className="text-xs text-gray-500">(You)</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          Joined {new Date(member.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {canManageTeam && member.role !== 'owner' && !isCurrentUser ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                          disabled={actionLoading === `role-${member.user_id}`}
                          className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${roleDisplay.color}`}>
                          <RoleIcon className="w-4 h-4" />
                          <span className="text-sm font-medium">{roleDisplay.label}</span>
                        </div>
                      )}

                      {canManageTeam && member.role !== 'owner' && !isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.user_id, member.users.email)}
                          disabled={actionLoading === `remove-${member.user_id}`}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {actionLoading === `remove-${member.user_id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Pending Invitations */}
        {canManageTeam && invitations.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Mail className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">Pending Invitations ({invitations.length})</h2>
            </div>

            <div className="space-y-3">
              {invitations.map((invite) => {
                const roleDisplay = getRoleDisplay(invite.role)
                const RoleIcon = roleDisplay.icon

                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-4 border border-dashed rounded-lg"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{invite.email}</p>
                        <p className="text-sm text-gray-500">
                          Invited {new Date(invite.created_at).toLocaleDateString()} • 
                          Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${roleDisplay.color}`}>
                        <RoleIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">{roleDisplay.label}</span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvite(invite.id, invite.email)}
                        disabled={actionLoading === `cancel-${invite.id}`}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {actionLoading === `cancel-${invite.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Cancel'
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

