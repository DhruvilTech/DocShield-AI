// src/pages/Auth/Register.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { Button, Card } from '../../components/ui';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [checkpoint, setCheckpoint] = useState('');
  const [role, setRole] = useState('screening_officer');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Name, email, and password are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Access key confirmation does not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await register({
        name: `${name.trim()}${badgeId ? ` [Badge: ${badgeId.trim()}]` : ''}`,
        email: email.trim(),
        password,
        role,
      });
      navigate('/scanner', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to register account. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 35%, rgba(0, 184, 169, 0.08) 0%, transparent 65%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-lg"
      >
        <Card className="p-8 sm:p-10 border-[var(--border-strong)] bg-[var(--surface)]/80 backdrop-blur-2xl shadow-[var(--shadow-lg)]">
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[var(--accent)] flex items-center justify-center text-[#05070A] shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-1)] tracking-tight">
              Border Clearance Registration
            </h1>
            <p className="text-xs text-[var(--text-2)] mt-1 font-mono">
              Register border security personnel & screening officers
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-5 p-3 rounded-lg border border-[var(--threat)]/40 bg-[var(--threat)]/10 text-[var(--threat)] text-xs flex items-center gap-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                Full Officer Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Officer James Mitchell"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                Official Agency / Security Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. j.mitchell@bordercontrol.gov"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                  Badge / Service ID
                </label>
                <input
                  type="text"
                  value={badgeId}
                  onChange={(e) => setBadgeId(e.target.value)}
                  placeholder="e.g. BC-90214"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                  Assigned Checkpoint
                </label>
                <input
                  type="text"
                  value={checkpoint}
                  onChange={(e) => setCheckpoint(e.target.value)}
                  placeholder="e.g. Terminal 4 Checkpoint"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                Clearance Role & Function
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
              >
                <option value="screening_officer">Border Screening Officer (Checkpoint Verification)</option>
                <option value="investigator">Forensic Investigator (Deep Document Forensics)</option>
                <option value="analyst_viewer">Compliance Analyst (Inspection Reports & Audit)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                  Access Key / Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-2)] mb-1">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="showPass"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-0"
              />
              <label htmlFor="showPass" className="text-[11px] font-mono text-[var(--text-3)] cursor-pointer">
                Reveal Password
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              Authorize & Create Account
            </Button>
          </form>

          <div className="text-center mt-5 text-xs text-[var(--text-2)]">
            Already registered?{' '}
            <Link to="/login" className="text-[var(--accent)] font-semibold hover:underline">
              Access Enclave Node
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
