import React, { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ScanLine, History, ShieldCheck, LogOut, User,
  Tag, FileBarChart, UserCircle, Store as StoreIcon, ShoppingBag,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Sidebar, SidebarBody, SidebarLink } from './Sidebar'
import PillNav from './PillNav'
import NotificationBell from './NotificationBell'
import { useOrderPolling } from '../lib/useOrderPolling'

const sellerNavLinks = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <LayoutDashboard className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Scan Product',
    href: '/scan',
    icon: <ScanLine className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Sell',
    href: '/sell',
    icon: <Tag className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: <ShoppingBag className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: <FileBarChart className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: <UserCircle className="h-5 w-5 flex-shrink-0" />,
  },
]

const buyerNavLinks = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <LayoutDashboard className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Scan Product',
    href: '/scan',
    icon: <ScanLine className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Stores',
    href: '/stores',
    icon: <StoreIcon className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: <ShoppingBag className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'History',
    href: '/history',
    icon: <History className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: <FileBarChart className="h-5 w-5 flex-shrink-0" />,
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: <UserCircle className="h-5 w-5 flex-shrink-0" />,
  },
]

export default function AppShell({ children }) {
  const [open, setOpen] = useState(false)
  const { user, profile, sellerProfile, signOut } = useAuth()
  const navigate = useNavigate()

  // Poll for order notifications
  const role = profile?.role || 'buyer'
  useOrderPolling(user?.id, role)

  const navLinks = role === 'seller' ? sellerNavLinks : buyerNavLinks

  // Memoize navLinks to prevent re-renders
  const stableNavLinks = useMemo(() => navLinks, [role])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // Determine display name: prefer seller shop name, then user profile, then metadata
  const displayName =
    (role === 'seller' && sellerProfile?.shopName) ||
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'User'

  const displaySubtitle =
    role === 'seller' && sellerProfile?.shopName
      ? sellerProfile.shopName
      : profile?.email || user?.email || ''

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {/* Logo */}
            <div className="px-2 py-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary-600 flex-shrink-0" />
                <span
                  className="font-semibold text-base text-neutral-900 whitespace-pre"
                  style={{
                    opacity: open ? 1 : 0,
                    width: open ? 'auto' : 0,
                    overflow: 'hidden',
                    transition: 'opacity 0.2s ease-in-out, width 0.2s ease-in-out',
                  }}
                >
                  LegalCheck AI
                </span>
              </div>
            </div>

            {/* Navigation links */}
            <div className="mt-8 flex flex-col gap-1">
              {stableNavLinks.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>

          {/* Footer: user profile + sign out */}
          <div className="px-2 pb-2">
            {/* User info */}
            <div className="flex items-center gap-2 py-2 px-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-600" />
                </div>
              )}
              <div
                className="min-w-0"
                style={{
                  opacity: open ? 1 : 0,
                  width: open ? 'auto' : 0,
                  overflow: 'hidden',
                  transition: 'opacity 0.2s ease-in-out, width 0.2s ease-in-out',
                }}
              >
                <p className="text-sm font-medium text-neutral-900 truncate">{displayName}</p>
                <p className="text-xs text-neutral-400 truncate">{displaySubtitle}</p>
              </div>
            </div>

            {/* Notification bell + Sign out */}
            <div className="flex items-center gap-1">
              <NotificationBell compact />
              <button
                onClick={handleSignOut}
                className="flex-1 flex items-center gap-2 py-2 px-2 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors"
                title="Sign out"
              >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span
                className="text-sm font-medium whitespace-pre"
                style={{
                  opacity: open ? 1 : 0,
                  width: open ? 'auto' : 0,
                  overflow: 'hidden',
                  transition: 'opacity 0.2s ease-in-out, width 0.2s ease-in-out',
                }}
              >
                Sign Out
              </span>
              </button>
            </div>

            {/* Version info */}
            <div
              className="text-xs text-neutral-400 whitespace-pre mt-1"
              style={{
                opacity: open ? 1 : 0,
                transition: 'opacity 0.2s ease-in-out',
              }}
            >
              SIH 2025 • v0.1.0
            </div>
          </div>
        </SidebarBody>
      </Sidebar>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>

      {/* Mobile Pill Nav */}
      <PillNav items={stableNavLinks.map(l => ({ ...l, icon: l.icon }))} />
    </div>
  )
}
