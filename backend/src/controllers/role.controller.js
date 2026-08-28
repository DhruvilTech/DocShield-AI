// src/controllers/role.controller.js
import { roleService } from '../services/role.service.js';
import { ResponseUtil } from '../utils/response.js';

export class RoleController {
  listRoles = async (req, res, next) => {
    try {
      const roles = await roleService.listRoles();
      ResponseUtil.sendSuccess(res, { roles });
    } catch (error) {
      next(error);
    }
  };

  listPermissions = async (req, res, next) => {
    try {
      const permissions = await roleService.listPermissions();
      ResponseUtil.sendSuccess(res, { permissions });
    } catch (error) {
      next(error);
    }
  };

  assignUserRoles = async (req, res, next) => {
    try {
      await roleService.assignUserRoles(req.params.id, req.body.roleIds, req.user.userId);
      ResponseUtil.sendSuccess(res, null, 'User roles updated successfully');
    } catch (error) {
      next(error);
    }
  };

  updateRolePermissions = async (req, res, next) => {
    try {
      await roleService.updateRolePermissions(req.params.id, req.body.permissionIds, req.user.userId);
      ResponseUtil.sendSuccess(res, null, 'Role permissions updated successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const roleController = new RoleController();
