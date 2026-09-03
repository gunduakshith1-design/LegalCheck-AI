import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Menu, X } from 'lucide-react';
import './PillNav.css';

/**
 * PillNav — compact mobile navigation bar.
 *
 * Desktop: hidden (existing sidebar handles navigation)
 * Mobile: compact bottom-aligned pill navigation
 */
export default function PillNav({ items = [], className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Show only first 4 items in the pill bar, rest in overflow menu
  const primaryItems = items.slice(0, 4);
  const overflowItems = items.slice(4);

  return (
    <div className={`pill-nav-container ${className}`}>
      {/* Logo */}
      <Link to="/" className="pill-nav-logo" aria-label="LegalCheck AI Home">
        <ShieldCheck className="h-5 w-5" />
      </Link>

      {/* Primary pills */}
      <div className="pill-nav-items">
        {primaryItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`pill-nav-pill ${isActive ? 'pill-nav-pill--active' : ''}`}
              aria-label={item.label}
            >
              <span className="pill-nav-pill-icon">{item.icon}</span>
              <span className="pill-nav-pill-label">{item.label}</span>
            </Link>
          );
        })}

        {/* Overflow menu button */}
        {overflowItems.length > 0 && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="pill-nav-pill pill-nav-pill--menu"
            aria-label="More options"
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Overflow dropdown */}
      {isOpen && overflowItems.length > 0 && (
        <>
          <div className="pill-nav-overlay" onClick={() => setIsOpen(false)} />
          <div className="pill-nav-dropdown">
            {overflowItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`pill-nav-dropdown-item ${isActive ? 'pill-nav-dropdown-item--active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  <span className="pill-nav-dropdown-icon">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
