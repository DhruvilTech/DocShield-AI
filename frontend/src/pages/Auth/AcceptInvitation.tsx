// src/pages/Auth/AcceptInvitation.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { invitationApi } from '../../lib/api/invitation.api';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { OrganizationInvitation } from '../../types';
import { Button, Card, Badge } from '../../components/ui';

export const AcceptInvitationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { refreshOrganizations } = useOrganization();

  const [invitation, setInvitation] = useState<OrganizationInvitation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing invitation token');
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const details = await invitationApi.getInvitationDetails(token);
        setInvitation(details);
      } catch (err: any) {
        setError(err.message || 'Invitation is invalid, expired, or has already been accepted.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    try {
      setIsAccepting(true);
      setError(null);
      await invitationApi.acceptInvitation(token);
      setSuccess(true);
      await refreshOrganizations();
      setTimeout(() => {
        navigate('/vault');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center font-mono">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Card className="p-8 border-[var(--border)] shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mx-auto mb-4 border border-[var(--border-accent)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-center text-[var(--text-1)] mb-1">
            Organization Invitation
          </h2>
          <p className="text-xs text-center text-[var(--text-3)] mb-6">
            DocShield AI Multi-Tenant Security Operations
          </p>

          {isLoading && (
            <div className="text-center py-6 text-xs text-[var(--text-3)]">
              Verifying cryptographic invitation token...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-[var(--threat-muted)] border border-[var(--threat)]/40 text-[var(--threat)] text-xs mb-6">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-[var(--safe-muted)] border border-[var(--safe)]/40 text-[var(--safe)] text-xs text-center mb-6">
              ✅ Welcome to {invitation?.organization_name}! Redirecting to Document Vault...
            </div>
          )}

          {invitation && !success && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--text-3)]">Organization:</span>
                  <span className="font-bold text-[var(--text-1)]">{invitation.organization_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-3)]">Assigned Role:</span>
                  <Badge variant="accent" size="sm">{invitation.role_name || 'Member'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-3)]">Invited Email:</span>
                  <span className="text-[var(--text-2)]">{invitation.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-3)]">Invited By:</span>
                  <span className="text-[var(--text-2)]">{invitation.inviter_name || 'Administrator'}</span>
                </div>
              </div>

              {isAuthenticated ? (
                <div>
                  <Button
                    onClick={handleAccept}
                    variant="primary"
                    className="w-full"
                    disabled={isAccepting}
                  >
                    {isAccepting ? 'Enrolling in Organization...' : 'Accept Invitation & Enter Vault'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-center text-xs text-[var(--text-3)]">
                    Please log in or create an account to accept this invitation:
                  </div>
                  <Link to={`/login?redirect=/invitations/accept?token=${token}`}>
                    <Button variant="primary" className="w-full mb-2">
                      Log In to Accept
                    </Button>
                  </Link>
                  <Link to={`/register?redirect=/invitations/accept?token=${token}`}>
                    <Button variant="outline" className="w-full">
                      Register New Account
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
};
