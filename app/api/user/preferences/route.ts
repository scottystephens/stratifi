import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getRatesPreferences, updateRatesPreferences } from '@/lib/services/user-preference-service'

async function requireUser(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const preferences = await getRatesPreferences(user.id)
    return NextResponse.json({ data: preferences })
  } catch (error: any) {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const body = await request.json()
    if (!body) {
      return NextResponse.json({ error: 'Payload required' }, { status: 400 })
    }

    const updates = body.preferences ?? body
    const preferences = await updateRatesPreferences(user.id, updates)
    return NextResponse.json({ data: preferences })
  } catch (error: any) {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}

