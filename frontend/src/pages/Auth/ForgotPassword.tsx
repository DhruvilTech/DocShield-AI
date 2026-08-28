// src/pages/Auth/ForgotPassword.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authApi } from '../../lib/api/auth.api';
import { Button, Card } from '../../components/ui';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      await authApi.forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 flex items-center justify-center relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="p-8 sm:p-10 border-[var(--border-strong)] bg-[var(--surface)]/80 backdrop-blur-2xl shadow-[var(--shadow-lg)]">
          <div className="text-center mb-8">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--border-accent)] flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Recover Access Key</h1>
            <p className="text-xs text-[var(--text-2)] mt-1 font-mono">
              Enter your email to receive secure recovery instructions
            </p>
          </div>

          {submitted ? (
            <div className="p-4 rounded-xl bg-[var(--safe)]/10 border border-[var(--safe)]/20 text-center">
              <div className="w-8 h-8 mx-auto mb-2 text-[var(--safe)]">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-[var(--text-1)] mb-1">Recovery Dispatched</h3>
              <p className="text-xs text-[var(--text-2)] leading-relaxed mb-4">
                If an account with {email} exists, a secure password reset link has been dispatched to your inbox.
              </p>
              <Link to="/login">
                <Button size="sm" variant="secondary" className="w-full">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg border border-[var(--threat)]/40 bg-[var(--threat)]/10 text-[var(--threat)] text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officer@docshield.ai"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Send Reset Link
              </Button>

              <div className="text-center mt-4">
                <Link to="/login" className="text-xs text-[var(--text-2)] hover:text-[var(--text-1)]">
                  ← Back to Login
                </Link>
              </div>
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
