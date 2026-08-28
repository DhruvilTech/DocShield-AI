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
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('screening_officer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await register({ name, email, password, role });
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 flex items-center justify-center relative overflow-hidden">
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
        className="relative z-10 w-full max-w-md"
      >
        <Card className="p-8 sm:p-10 border-[var(--border-strong)] bg-[var(--surface)]/80 backdrop-blur-2xl shadow-[var(--shadow-lg)]">
          <div className="text-center mb-8">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--accent)] flex items-center justify-center text-[#05070A] shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-1)] tracking-tight">
              Create Clearance Node
            </h1>
            <p className="text-xs text-[var(--text-2)] mt-1.5 font-mono">
              Register an operator account for DocShield AI
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-3 rounded-lg border border-[var(--threat)]/40 bg-[var(--threat)]/10 text-[var(--threat)] text-xs flex items-center gap-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase tracking-wider">
                Full Name / Officer Alias
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent Alex Vance"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase tracking-wider">
                Corporate Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.vance@docshield.ai"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase tracking-wider">
                Assigned Operational Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
              >
                <option value="screening_officer">Screening Officer (Standard Scanner Access)</option>
                <option value="investigator">Investigator (Forensics & Audit Trail Access)</option>
                <option value="analyst_viewer">Analyst / Viewer (Read-only Telemetry)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <p className="text-[10px] text-[var(--text-3)] mt-1 font-mono">
                Must include 8+ chars, upper & lower case, number, and special character.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              Register & Initialize Enclave
            </Button>
          </form>

          <div className="text-center mt-6 text-xs text-[var(--text-2)]">
            Already have an active credential?{' '}
            <Link to="/login" className="text-[var(--accent)] font-semibold hover:underline">
              Sign In
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
