import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Navbar } from './components/navigation/Navbar';
import { CustomCursor } from './components/common/CustomCursor';
import { SmoothScroll } from './components/layout/SmoothScroll';
import { SceneProvider, useScene } from './context/SceneContext';
import { AuthProvider } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ThemeProvider } from './context/ThemeContext';
import { useTheme } from './hooks/useTheme';
import { variantFromPath } from './lib/scene';
import { pageTransitionVariants } from './lib/animations';

const HomePage = lazy(() => import('./pages/Home'));
const ScannerPage = lazy(() => import('./pages/Scanner'));
const IntelligencePage = lazy(() => import('./pages/Intelligence'));
const AnalysisPage = lazy(() => import('./pages/Analysis'));
const ThreatsPage = lazy(() => import('./pages/Threats'));
const VaultPage = lazy(() => import('./pages/Vault'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const EnterprisePage = lazy(() => import('./pages/Enterprise'));

// Auth & Admin Pages
const LoginPage = lazy(() => import('./pages/Auth/Login'));
const RegisterPage = lazy(() => import('./pages/Auth/Register'));
const ForgotPasswordPage = lazy(() => import('./pages/Auth/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('./pages/Auth/ResetPassword'));
const VerifyEmailPage = lazy(() => import('./pages/Auth/VerifyEmail'));
const AcceptInvitationPage = lazy(() => import('./pages/Auth/AcceptInvitation').then(m => ({ default: m.AcceptInvitationPage })));
const ProfilePage = lazy(() => import('./pages/Profile'));

/* §9 lazy-load R3F so first paint is not blocked by WebGL */
const SceneManager = lazy(() => import('./components/3d/SceneManager'));

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    variants={pageTransitionVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className="relative z-10"
  >
    {children}
  </motion.div>
);

const PageLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
      <p className="text-xs font-mono text-[var(--text-3)]">Allocating Security Enclave…</p>
    </div>
  </div>
);

function RouteSceneSync() {
  const location = useLocation();
  const { setVariant } = useScene();
  useEffect(() => {
    setVariant(variantFromPath(location.pathname));
  }, [location.pathname, setVariant]);
  return null;
}

const AppRoutes: React.FC<{ theme: 'dark' | 'light'; onToggle: () => void }> = ({ theme, onToggle }) => {
  const location = useLocation();

  return (
    <>
      <RouteSceneSync />
      <CustomCursor />
      <Suspense fallback={null}>
        <SceneManager theme={theme} />
      </Suspense>
      {/* §10 scrim — keeps WCAG contrast over the 3D field */}
      <div className="fixed inset-0 pointer-events-none content-scrim" style={{ zIndex: 1 }} aria-hidden />

      <div className="relative" style={{ zIndex: 10 }}>
        <Navbar theme={theme} onToggleTheme={onToggle} />
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              {/* Public Core Routes */}
              <Route path="/" element={<PageWrapper><HomePage /></PageWrapper>} />

              {/* Authentication & Invitation Routes */}
              <Route path="/login" element={<PageWrapper><LoginPage /></PageWrapper>} />
              <Route path="/register" element={<PageWrapper><RegisterPage /></PageWrapper>} />
              <Route path="/forgot-password" element={<PageWrapper><ForgotPasswordPage /></PageWrapper>} />
              <Route path="/reset-password" element={<PageWrapper><ResetPasswordPage /></PageWrapper>} />
              <Route path="/verify-email" element={<PageWrapper><VerifyEmailPage /></PageWrapper>} />
              <Route path="/invitations/accept" element={<PageWrapper><AcceptInvitationPage /></PageWrapper>} />

              {/* Protected Operational & Inspection Routes */}
              <Route
                path="/scanner"
                element={
                  <ProtectedRoute>
                    <PageWrapper><ScannerPage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/intelligence"
                element={
                  <ProtectedRoute>
                    <PageWrapper><IntelligencePage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analysis"
                element={
                  <ProtectedRoute>
                    <PageWrapper><AnalysisPage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/threats"
                element={
                  <ProtectedRoute>
                    <PageWrapper><ThreatsPage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vault"
                element={
                  <ProtectedRoute>
                    <PageWrapper><VaultPage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <PageWrapper><ReportsPage /></PageWrapper>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/enterprise"
                element={
                  <ProtectedRoute>
                    <PageWrapper><EnterprisePage /></PageWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Protected User Profile Route */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <PageWrapper><ProfilePage /></PageWrapper>
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<PageWrapper><HomePage /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </div>
    </>
  );
};

const AppContent: React.FC = () => {
  const { theme, toggle } = useTheme();

  return (
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <SceneProvider>
            <SmoothScroll>
              <AppRoutes theme={theme} onToggle={toggle} />
            </SmoothScroll>
          </SceneProvider>
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
