// src/controllers/user.controller.js
import { userService } from '../services/user.service.js';
import { ResponseUtil } from '../utils/response.js';

export class UserController {
  getMe = async (req, res, next) => {
    try {
      const user = await userService.getProfile(req.user.userId);
      ResponseUtil.sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req, res, next) => {
    try {
      const user = await userService.updateProfile(req.user.userId, req.body);
      ResponseUtil.sendSuccess(res, { user }, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  };

  updatePassword = async (req, res, next) => {
    try {
      await userService.updatePassword(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      ResponseUtil.sendSuccess(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  };

  // Admin Endpoints
  listUsers = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const search = req.query.search;

      const { users, total } = await userService.listUsers(page, limit, search);
      ResponseUtil.sendPaginated(res, users, total, page, limit);
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (req, res, next) => {
    try {
      const user = await userService.getUserById(req.params.id);
      ResponseUtil.sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };

  createUser = async (req, res, next) => {
    try {
      const user = await userService.createUserByAdmin(req.body, req.user.userId);
      ResponseUtil.sendSuccess(res, { user }, 'User created successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req, res, next) => {
    try {
      const user = await userService.updateUserByAdmin(req.params.id, req.body, req.user.userId);
      ResponseUtil.sendSuccess(res, { user }, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req, res, next) => {
    try {
      await userService.deleteUserByAdmin(req.params.id, req.user.userId);
      ResponseUtil.sendSuccess(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const userController = new UserController();
