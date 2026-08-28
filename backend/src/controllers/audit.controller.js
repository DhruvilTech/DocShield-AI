// src/controllers/audit.controller.js
import { auditService } from '../services/audit.service.js';
import { ResponseUtil } from '../utils/response.js';

export class AuditController {
  listAuditLogs = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;

      const filters = {
        actorUserId: req.query.actorUserId,
        action: req.query.action,
        resourceType: req.query.resourceType,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
      };

      const { logs, total } = await auditService.getAuditLogs(page, limit, filters);
      ResponseUtil.sendPaginated(res, logs, total, page, limit);
    } catch (error) {
      next(error);
    }
  };
}

export const auditController = new AuditController();
