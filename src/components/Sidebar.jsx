import React, { useState, createContext, useContext, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, ShieldCheck } from 'lucide-react'

/**
 * Sidebar — lightweight version using CSS transitions instead of Framer Motion.
 * 
 * Provides: collapsible desktop sidebar, responsive mobile sidebar,
 * smooth open/close animation, icons visible when collapsed,
 * labels visible when expanded.
 */

const SidebarContext = createContext(undefined)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}) => {
  const [openState, setOpenState] = useState(false)
  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const Sidebar = ({ children, open, setOpen, animate }) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  )
}

export const SidebarBody = (props) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...props} />
    </>
  )
}

export const DesktopSidebar = ({ className, children, ...props }) => {
  const { open, setOpen, animate } = useSidebar()
  const hoverTimeoutRef = useRef(null)

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setOpen(true)
  }, [setOpen])

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setOpen(false)
    }, 100)
  }, [setOpen])

  return (
    <div
      className={`h-full px-3 py-4 hidden md:flex md:flex-col bg-white border-r border-neutral-200 flex-shrink-0 overflow-hidden ${className || ''}`}
      style={{
        width: animate ? (open ? '240px' : '68px') : '240px',
        transition: animate ? 'width 0.2s ease-in-out' : 'none',
        willChange: 'width',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </div>
  )
}

export const MobileSidebar = ({ className, children, ...props }) => {
  const { open, setOpen } = useSidebar()
  return (
    <>
      {/* Mobile header bar - hidden when overlay is open */}
      {!open && (
        <div
          className={`h-14 px-4 flex flex-row md:hidden items-center justify-between bg-white border-b border-neutral-200 w-full flex-shrink-0 ${className || ''}`}
          {...props}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-600" />
            <span className="font-semibold text-sm text-neutral-900">LegalCheck AI</span>
          </div>
          <div className="z-20 text-neutral-700 cursor-pointer" onClick={() => setOpen(!open)}>
            <Menu className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* Mobile overlay sidebar — pure CSS transition, no Framer Motion */}
      <div
        className={`fixed inset-0 h-full w-full bg-white z-[100] flex flex-col justify-between p-6 md:hidden ${
          open ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          opacity: open ? 1 : 0,
          transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
          willChange: 'transform, opacity',
        }}
      >
        <div className="absolute right-6 top-5 z-50 text-neutral-700 cursor-pointer" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </div>
        {children}
      </div>
    </>
  )
}

export const SidebarLink = ({ link, className, ...props }) => {
  const { open } = useSidebar()
  const location = useLocation()
  const isActive = location.pathname === link.href

  return (
    <Link
      to={link.href}
      className={`flex items-center justify-start gap-3 group/sidebar py-2 px-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary-50 text-primary-700'
          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
      } ${className || ''}`}
      {...props}
    >
      <span className="flex-shrink-0">{link.icon}</span>
      <span
        className="text-sm font-medium whitespace-pre"
        style={{
          display: 'inline-block',
          opacity: open ? 1 : 0,
          width: open ? 'auto' : 0,
          overflow: 'hidden',
          transition: 'opacity 0.2s ease-in-out, width 0.2s ease-in-out',
        }}
      >
        {link.label}
      </span>
    </Link>
  )
}
