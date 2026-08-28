// src/routes/invitation.routes.js
import { Router } from 'express';
import * as invitationController from '../controllers/invitation.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { invitationLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Publicly check invitation details
router.get('/:token', invitationLimiter, invitationController.getInvitationDetails);

// Accept invitation as authenticated user
router.post('/:token/accept', requireAuth, invitationController.acceptInvitation);

export default router;
