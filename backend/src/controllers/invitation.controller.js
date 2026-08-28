// src/controllers/invitation.controller.js
import { invitationService } from '../services/invitation.service.js';
import { ResponseUtil } from '../utils/response.js';

export const getInvitationDetails = async (req, res, next) => {
  try {
    const invite = await invitationService.getInvitationByToken(req.params.token);
    return ResponseUtil.sendSuccess(res, { invitation: invite });
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const member = await invitationService.acceptInvitation(
      req.params.token,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { member }, 200, 'Invitation accepted. Welcome to the organization!');
  } catch (error) {
    next(error);
  }
};
