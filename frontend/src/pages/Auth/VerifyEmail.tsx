// src/pages/Auth/VerifyEmail.tsx
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authApi } from '../../lib/api/auth.api';
import { Button, Card } from '../../components/ui';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Verification token is missing from the link.');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        await authApi.verifyEmail(token);
        setSuccess(true);
      } catch (err: any) {
        setError(err.message || 'Email verification link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 flex items-center justify-center relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="p-8 sm:p-10 border-[var(--border-strong)] bg-[var(--surface)]/80 backdrop-blur-2xl shadow-[var(--shadow-lg)] text-center">
          {loading && (
            <div className="py-8">
              <div className="w-10 h-10 mx-auto border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin mb-4" />
              <h2 className="text-lg font-bold text-[var(--text-1)]">Validating Enclave Token…</h2>
              <p className="text-xs text-[var(--text-3)] font-mono mt-1">Verifying clearance credentials</p>
            </div>
          )}

          {!loading && success && (
            <div className="py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--safe)]/10 text-[var(--safe)] border border-[var(--safe)]/30 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-1)] mb-2">Email Verified</h2>
              <p className="text-xs text-[var(--text-2)] mb-6 leading-relaxed">
                Your email address has been verified. Your DocShield operator enclave is fully active.
              </p>
              <Link to="/login">
                <Button size="md" variant="primary" className="w-full">
                  Proceed to Login
                </Button>
              </Link>
            </div>
          )}

          {!loading && error && (
            <div className="py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--threat)]/10 text-[var(--threat)] border border-[var(--threat)]/30 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-1)] mb-2">Verification Failed</h2>
              <p className="text-xs text-[var(--threat)] mb-6 leading-relaxed">{error}</p>
              <Link to="/login">
                <Button size="md" variant="secondary" className="w-full">
                  Return to Login
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

export default VerifyEmailPage;
