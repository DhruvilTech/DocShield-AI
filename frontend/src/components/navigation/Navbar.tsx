import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, ThemeSwitcher, cn, MagneticButton } from '../ui';
import { navEntranceVariants } from '../../lib/animations';
import type { Theme } from '../../types';

const NAV_LINKS = [
  { label: 'Intelligence', path: '/intelligence' },
  { label: 'Scanner',      path: '/scanner' },
  { label: 'Forensics',    path: '/analysis' },
  { label: 'Threats',      path: '/threats' },
  { label: 'Security',     path: '/security' },
  { label: 'Vault',        path: '/vault' },
  { label: 'Reports',      path: '/reports' },
  { label: 'Enterprise',   path: '/enterprise' },
];

interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ theme, onToggleTheme }) => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
          <nav className="hidden xl:flex items-center gap-1">
            {NAV_LINKS.map((item) => {
              const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'nav-underline px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-150 relative',
                    active
                      ? 'text-[var(--accent)] bg-[var(--accent-muted)] font-semibold shadow-[0_0_10px_rgba(0,184,169,0.12)]'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]'
                  )}
                >
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

          {/* Medium Screen Nav Bar (Dropdown / More Links) */}
          <nav className="hidden lg:flex xl:hidden items-center gap-1">
            {NAV_LINKS.slice(0, 5).map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors',
                    active
                      ? 'text-[var(--accent)] bg-[var(--accent-muted)] font-semibold'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />

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
              {NAV_LINKS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between',
                      active
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-bold'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-1)]'
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] text-[var(--text-3)]">→</span>
                  </Link>
                );
              })}

              <div className="pt-2 mt-2 border-t border-[var(--border)]">
                <Link to="/scanner">
                  <Button size="sm" variant="primary" className="w-full">
                    Launch Document Scanner
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
