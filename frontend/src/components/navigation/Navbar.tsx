import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, ThemeSwitcher, cn, MagneticButton, Badge } from '../ui';
import { navEntranceVariants } from '../../lib/animations';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import type { Theme } from '../../types';

const NAV_LINKS = [
  { label: 'Intelligence', path: '/intelligence' },
  { label: 'Scanner', path: '/scanner' },
  { label: 'Forensics', path: '/analysis' },
  { label: 'Threats', path: '/threats' },
  { label: 'Security', path: '/security' },
  { label: 'Vault', path: '/vault' },
  { label: 'Reports', path: '/reports' },
  { label: 'Enterprise', path: '/enterprise' },
];

interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ theme, onToggleTheme }) => {
  const location = useLocation();
  const { user, isAuthenticated, isSuperAdmin, logout, hasPermission } = useAuth();
  const { organizations, activeOrganization, switchOrganization } = useOrganization();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  // Compute strictly segregated role-based navigation links
  const navLinks = isSuperAdmin
    ? [
        { label: '⚡ Mission Command', path: '/admin', isCommand: true },
        { label: 'Organizations', path: '/admin/organization' },
        { label: 'Watchlists', path: '/admin/watchlist' },
        { label: 'User RBAC', path: '/admin/users' },
        { label: 'Audit Logs', path: '/admin/audit-trail' },
        { label: 'Threats', path: '/threats' },
        { label: 'Security', path: '/security' },
        { label: 'Reports', path: '/reports' },
        { label: 'Enterprise', path: '/enterprise' },
      ]
    : [
        { label: 'Scanner', path: '/scanner' },
        { label: 'Vault', path: '/vault' },
        { label: 'Forensics', path: '/analysis' },
        { label: 'Intelligence', path: '/intelligence' },
      ];

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setUserDropdownOpen(false);
    setOrgDropdownOpen(false);
  }, [location.pathname]);

  // Click outside listener for user & org dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canManageUsers = isSuperAdmin || hasPermission('users:read');
  const canViewAudit = isSuperAdmin || hasPermission('audit_logs:read');

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
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[#05070A] shadow-sm animate-logo-pulse group-hover:shadow-[var(--glow-accent)] transition-all duration-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-sm text-[var(--text-1)] tracking-tight">DocShield</span>
              <span className="text-[10px] font-mono text-[var(--accent)] font-bold px-1 py-0.2 rounded bg-[var(--accent-muted)] border border-[var(--border-accent)]">
                AI
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((item) => {
              const active = location.pathname === item.path || (item.path !== '/' && item.path !== '/admin' && location.pathname.startsWith(item.path));
              const isCommand = (item as any).isCommand;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'nav-underline px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-150 relative flex items-center gap-1.5',
                    isCommand && !active
                      ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 shadow-[0_0_12px_rgba(0,184,169,0.15)] font-bold'
                      : active
                      ? 'text-[var(--accent)] bg-[var(--accent-muted)] font-semibold shadow-[0_0_10px_rgba(0,184,169,0.12)]'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  {isCommand && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                  )}
                  {item.label}
                  {active && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className="absolute bottom-0 inset-x-2 h-0.5 bg-[var(--accent)] rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Action Tools & Auth Profile */}
          <div className="flex items-center gap-2">
            <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />

            {/* Organization Switcher Dropdown (When Authenticated & is Admin/Org member) */}
            {isAuthenticated && isSuperAdmin && (
              <div className="relative" ref={orgDropdownRef}>
                {activeOrganization ? (
                  <button
                    onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] border border-[var(--border)] transition-colors text-xs font-mono text-[var(--text-1)]"
                    title="Switch Active Organization"
                  >
                    <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="max-w-[110px] truncate hidden md:inline font-medium">
                      {activeOrganization.name}
                    </span>
                    <svg className="w-3 h-3 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                ) : (
                  <Link
                    to="/admin/organization"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--accent-muted)] hover:bg-[var(--accent)]/20 border border-[var(--border-accent)] transition-colors text-xs font-mono text-[var(--accent)]"
                    title="Establish Organization"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="hidden md:inline font-medium">Establish Org</span>
                  </Link>
                )}

                <AnimatePresence>
                  {orgDropdownOpen && activeOrganization && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-64 rounded-xl bg-[var(--surface)] border border-[var(--border-strong)] shadow-2xl p-2 z-50 text-xs font-mono"
                    >
                      <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-[var(--text-3)] tracking-wider">
                        Organizations ({organizations.length})
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1 mb-1">
                        {organizations.map((org) => {
                          const isCurrent = org.id === activeOrganization.id;
                          return (
                            <button
                              key={org.id}
                              onClick={() => {
                                switchOrganization(org.id);
                                setOrgDropdownOpen(false);
                              }}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors',
                                isCurrent
                                  ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-semibold border border-[var(--border-accent)]'
                                  : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]'
                              )}
                            >
                              <div className="truncate mr-2">
                                <div className="truncate">{org.name}</div>
                                <div className="text-[10px] text-[var(--text-3)] truncate font-normal">
                                  {org.role_name || 'Member'}
                                </div>
                              </div>
                              {isCurrent && (
                                <svg className="w-4 h-4 text-[var(--accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="border-t border-[var(--border)] pt-1">
                        <Link
                          to="/admin/organization"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Manage Organizations
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* If Authenticated: User Badge & Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded-lg border transition-colors focus:outline-none',
                    isSuperAdmin
                      ? 'bg-[var(--accent-muted)] border-[var(--border-accent)] hover:border-[var(--accent)]'
                      : 'bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] border-[var(--border)]'
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center',
                    isSuperAdmin ? 'bg-[var(--accent)] text-[#05070A]' : 'bg-[var(--surface)] text-[var(--text-1)]'
                  )}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-mono text-[var(--text-1)] hidden md:inline-block max-w-[100px] truncate">
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
                      className="absolute right-0 mt-2 w-60 rounded-xl bg-[var(--surface)] border border-[var(--border-strong)] shadow-2xl p-2 z-50 text-xs font-mono"
                    >
                      <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                        <div className="font-bold text-[var(--text-1)] truncate">{user.name}</div>
                        <div className="text-[10px] text-[var(--text-3)] truncate">{user.email}</div>
                        <div className="mt-1.5 flex gap-1">
                          <Badge variant={isSuperAdmin ? 'accent' : 'neutral'} size="sm">
                            {user.roles[0] || 'Operator'}
                          </Badge>
                          {isSuperAdmin && (
                            <Badge variant="safe" size="sm">
                              ROOT ACCESS
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Super Admin Exclusive Mission Command Option */}
                      {isSuperAdmin && (
                        <Link
                          to="/admin"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/20 border border-[var(--border-accent)] transition-colors mb-1 shadow-sm"
                        >
                          <svg className="w-4 h-4 text-[var(--accent)] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Mission Command Console
                        </Link>
                      )}

                      <Link
                        to="/profile"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Officer Profile
                      </Link>

                      {/* Super Admin Management Links */}
                      {isSuperAdmin && (
                        <>
                          <Link
                            to="/admin/organization"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            Organization Setup
                          </Link>

                          <Link
                            to="/admin/watchlist"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Border Watchlist
                          </Link>

                          <Link
                            to="/admin/users"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            User Management
                          </Link>

                          <Link
                            to="/admin/audit-trail"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Audit Trail Logs
                          </Link>
                        </>
                      )}

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
                    Register
                  </Button>
                </Link>
              </div>
            )}

            {/* Role-tailored CTA Header Button */}
            {isSuperAdmin ? (
              <Link to="/admin" className="hidden sm:block">
                <MagneticButton>
                  <Button size="sm" variant="primary" className="shadow-[0_0_15px_rgba(0,184,169,0.35)] bg-[var(--accent)] text-[#05070A] font-bold">
                    <svg className="w-3.5 h-3.5 group-hover:translate-y-[-1px] transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Mission Console
                  </Button>
                </MagneticButton>
              </Link>
            ) : (
              <Link to="/scanner" className="hidden sm:block">
                <MagneticButton>
                  <Button size="sm" variant="primary" className="shadow-[0_0_0_1px_rgba(124,92,252,0.45)]">
                    <svg className="w-3.5 h-3.5 group-hover:translate-y-[-1px] transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Start Scan
                  </Button>
                </MagneticButton>
              </Link>
            )}

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
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="lg:hidden border-t border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1 font-mono">
              {navLinks.map((item) => {
                const active = location.pathname === item.path;
                const isCommand = (item as any).isCommand;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between',
                      isCommand
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--border-accent)] font-bold'
                        : active
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-1)]'
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] text-[var(--text-3)]">→</span>
                  </Link>
                );
              })}

              <div className="pt-2 mt-2 border-t border-[var(--border)] flex flex-col gap-2">
                {!isAuthenticated ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/login">
                      <Button size="sm" variant="secondary" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/register">
                      <Button size="sm" variant="outline" className="w-full">
                        Register
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Link to="/profile">
                    <Button size="sm" variant="secondary" className="w-full">
                      {isSuperAdmin ? 'Administrator Profile' : 'Operator Profile'}
                    </Button>
                  </Link>
                )}

                {isSuperAdmin ? (
                  <Link to="/admin">
                    <Button size="sm" variant="primary" className="w-full bg-[var(--accent)] text-[#05070A] font-bold">
                      ⚡ Open Mission Command Console
                    </Button>
                  </Link>
                ) : (
                  <Link to="/scanner">
                    <Button size="sm" variant="primary" className="w-full">
                      Launch Document Scanner
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;

