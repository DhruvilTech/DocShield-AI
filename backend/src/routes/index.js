// src/routes/index.js
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import roleRoutes from './role.routes.js';
import auditRoutes from './audit.routes.js';
import healthRoutes from './health.routes.js';
import organizationRoutes from './organization.routes.js';
import invitationRoutes from './invitation.routes.js';
import documentRoutes from './document.routes.js';
import watchlistRoutes from './watchlist.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/health', healthRoutes);
router.use('/organizations', organizationRoutes);
router.use('/invitations', invitationRoutes);
router.use('/documents', documentRoutes);
router.use('/watchlists', watchlistRoutes);
router.use('/watchlist', watchlistRoutes);

export default router;
