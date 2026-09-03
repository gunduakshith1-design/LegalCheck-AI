import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { fetchSellerProfile, dbRowToProfile } from '../lib/sellerProfile'

/**
 * Auth Context — centralised auth state for the entire app.
 *
 * States:
 *   loading         — session is being resolved
 *   unauthenticated — no valid session
 *   no-role         — authenticated but role not yet chosen
 *   no-seller-profile — seller without a completed shop registration
 *   authenticated   — fully authenticated with role (and seller profile if seller)
 */

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sellerProfile, setSellerProfile] = useState(null)
  const [sellerProfileLoading, setSellerProfileLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const supabaseReady = isSupabaseConfigured()

  // ── Derive status ──
  const status = loading
    ? 'loading'
    : !user
      ? 'unauthenticated'
      : !profile || !profile.role
        ? 'no-role'
        : profile.role === 'seller' && !sellerProfile && !sellerProfileLoading
          ? 'no-seller-profile'
          : 'authenticated'

  // ── Fetch / create user profile row ──
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase) return null
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code === 'PGRST116') {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        const insertPayload = {
          id: userId,
          email: authUser?.email ?? null,
          full_name: authUser?.user_metadata?.full_name ?? authUser?.user_metadata?.name ?? null,
          avatar_url: authUser?.user_metadata?.avatar_url ?? authUser?.user_metadata?.picture ?? null,
        }
        const { data: inserted, error: insertErr } = await supabase
          .from('user_profiles')
          .insert(insertPayload)
          .select()
          .single()

        if (insertErr) {
          console.error('[Auth] Failed to create profile:', insertErr)
          return null
        }
        return inserted
      }

      if (error) {
        console.error('[Auth] Failed to fetch profile:', error)
        return null
      }

      return data
    } catch (e) {
      console.error('[Auth] fetchProfile exception:', e)
      return null
    }
  }, [])

  // ── Fetch seller profile for sellers ──
  const loadSellerProfile = useCallback(async (userId, userRole) => {
    if (userRole !== 'seller' || !userId) {
      setSellerProfile(null)
      return
    }
    setSellerProfileLoading(true)
    const row = await fetchSellerProfile(userId)
    setSellerProfile(dbRowToProfile(row))
    setSellerProfileLoading(false)
  }, [])

  // ── Initialise: listen for auth state changes ──
  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    const initSession = async (session) => {
      if (!mounted) return
      if (session?.user) {
        setUser(session.user)
        const p = await fetchProfile(session.user.id)
        if (!mounted) return
        setProfile(p)
        if (p?.role === 'seller') {
          await loadSellerProfile(session.user.id, p.role)
        }
      } else {
        setUser(null)
        setProfile(null)
        setSellerProfile(null)
      }
      if (mounted) setLoading(false)
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => initSession(session))

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          const p = await fetchProfile(session.user.id)
          if (!mounted) return
          setProfile(p)
          if (p?.role === 'seller') {
            await loadSellerProfile(session.user.id, p.role)
          } else {
            setSellerProfile(null)
          }
        } else {
          setUser(null)
          setProfile(null)
          setSellerProfile(null)
        }

        if (mounted) setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [fetchProfile, loadSellerProfile])

  // ── Sign in with Google ──
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured. Check your environment variables.')
      return
    }
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })

    if (authError) {
      console.error('[Auth] Google sign-in error:', authError)
      setError(authError.message || 'Failed to sign in with Google.')
      setLoading(false)
    }
  }, [])

  // ── Set user role ──
  const setRole = useCallback(async (role) => {
    if (!supabase || !user) {
      setError('Not authenticated.')
      return false
    }
    if (role !== 'seller' && role !== 'buyer') {
      setError('Invalid role.')
      return false
    }

    setError(null)

    const { error: updateError } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, role }, { onConflict: 'id' })

    if (updateError) {
      console.error('[Auth] Failed to set role:', updateError)
      setError(updateError.message || 'Failed to save role.')
      return false
    }

    setProfile((prev) => ({ ...prev, role }))

    // If seller, clear seller profile to trigger re-fetch (should be null for new seller)
    if (role === 'seller') {
      setSellerProfile(null)
    }

    return true
  }, [user])

  // ── Refresh seller profile (call after creating/updating) ──
  const refreshSellerProfile = useCallback(async () => {
    if (!user?.id || !profile?.role) return
    await loadSellerProfile(user.id, profile.role)
  }, [user?.id, profile?.role, loadSellerProfile])

  // ── Sign out ──
  const signOut = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    setError(null)

    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      console.error('[Auth] Sign out error:', signOutError)
      setError(signOutError.message || 'Failed to sign out.')
      return
    }

    setUser(null)
    setProfile(null)
    setSellerProfile(null)
  }, [])

  // ── Clear error ──
  const clearError = useCallback(() => setError(null), [])

  const value = {
    user,
    profile,
    sellerProfile,
    sellerProfileLoading,
    status,
    loading,
    error,
    supabaseReady,
    signInWithGoogle,
    setRole,
    signOut,
    clearError,
    refreshSellerProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
