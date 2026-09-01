import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, ThemeSwitcher, cn, MagneticButton } from '../ui';
import { DocShieldLogo } from '../common/DocShieldLogo';
import { navEntranceVariants } from '../../lib/animations';
import { useAuth } from '../../hooks/useAuth';
import type { Theme } from '../../types';

const NAV_LINKS = [
  { label: 'Scanner', path: '/scanner' },
  { label: 'Vault', path: '/vault' },
  { label: 'Forensics', path: '/analysis' },
  { label: 'Intelligence', path: '/intelligence' },
  { label: 'Threats', path: '/threats' },
  { label: 'Reports', path: '/reports' },
];

interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ theme, onToggleTheme }) => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setUserDropdownOpen(false);
  }, [location.pathname]);

  // Click outside listener for user dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <motion.header
      variants={navEntranceVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-[var(--bg-surface)]/80 backdrop-blur-xl border-b border-[var(--border-hairline)] shadow-[var(--shadow-sm)]'
          : 'bg-transparent backdrop-blur-md'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* 3D Animated Logo */}
          <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <DocShieldLogo size={32} animated glow />
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-sm text-[var(--text-1)] tracking-tight group-hover:text-[var(--accent)] transition-colors">
                DocShield
              </span>
              <span className="text-[10px] font-mono text-[var(--accent)] font-bold px-1 py-0.2 rounded bg-[var(--accent-muted)] border border-[var(--border-accent)]">
                AI
              </span>
            </div>
          </Link>

          {/* Desktop Center Nav Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = location.pathname.startsWith(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    'relative px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200',
                    active
                      ? 'text-[var(--accent)] bg-[var(--accent-muted)] font-bold border border-[var(--border-accent)] shadow-sm'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  {link.label}
                  {active && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute bottom-0 inset-x-2 h-[2px] bg-[var(--accent)] rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />

            {/* If Authenticated: User Badge & Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] transition-colors focus:outline-none"
                >
                  <div className="w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center bg-[var(--accent)] text-[#05070A]">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-mono text-[var(--text-1)] hidden md:inline-block max-w-[120px] truncate">
                    {user.name}
                  </span>
                  <svg className="w-3.5 h-3.5 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {userDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 rounded-xl bg-[var(--surface)] border border-[var(--border-strong)] shadow-2xl p-2 z-50 text-xs font-mono"
                    >
                      <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                        <div className="font-bold text-[var(--text-1)] truncate">{user.name}</div>
                        <div className="text-[10px] text-[var(--text-3)] truncate">{user.email}</div>
                      </div>

                      <Link
                        to="/profile"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile Settings
                      </Link>

                      <div className="border-t border-[var(--border)] mt-1 pt-1">
                        <button
                          onClick={logout}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--threat)] hover:bg-[var(--threat)]/10 transition-colors text-left"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link to="/login">
                  <Button size="sm" variant="ghost">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" className="hidden sm:block">
                  <Button size="sm" variant="outline">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}

            {/* Primary Action Button */}
            <Link to="/scanner" className="hidden sm:block">
              <MagneticButton>
                <Button size="sm" variant="primary" className="shadow-[0_0_15px_rgba(0,184,169,0.3)] font-bold">
                  <svg className="w-3.5 h-3.5 group-hover:translate-y-[-1px] transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Start Scan
                </Button>
              </MagneticButton>
            </Link>

            {/* Mobile hamburger menu toggle */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-1)] transition-colors"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 space-y-2 text-xs font-mono"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'block px-3 py-2 rounded-lg transition-colors',
                  location.pathname.startsWith(link.path)
                    ? 'text-[var(--accent)] bg-[var(--accent-muted)] font-bold'
                    : 'text-[var(--text-2)] hover:bg-[var(--surface-raised)]'
                )}
              >
                {link.label}
              </Link>
            ))}

            {!isAuthenticated && (
              <div className="pt-2 border-t border-[var(--border)] flex gap-2">
                <Link to="/login" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" className="flex-1">
                  <Button size="sm" variant="primary" className="w-full">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
