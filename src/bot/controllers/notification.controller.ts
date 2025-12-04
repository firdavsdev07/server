import { Request, Response, NextFunction } from "express";
import notificationService from "../services/notification.service";
import BaseError from "../../utils/base.error";

class NotificationController {
  /**
   * Get all notifications for current manager
   */
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const managerId = req.user?.sub;

      if (!managerId) {
        return next(BaseError.BadRequest("Manager ID topilmadi"));
      }

      const limit = parseInt(req.query.limit as string) || 50;

      const notifications = await notificationService.getNotifications(
        managerId,
        limit
      );

      return res.status(200).json({
        status: "success",
        data: notifications,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const managerId = req.user?.sub;

      if (!managerId) {
        return next(BaseError.BadRequest("Manager ID topilmadi"));
      }

      const count = await notificationService.getUnreadCount(managerId);

      return res.status(200).json({
        status: "success",
        data: { count },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await notificationService.markAsRead(id);

      return res.status(200).json({
        status: "success",
        message: "Bildirishnoma o'qildi",
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const managerId = req.user?.sub;

      if (!managerId) {
        return next(BaseError.BadRequest("Manager ID topilmadi"));
      }

      const count = await notificationService.markAllAsRead(managerId);

      return res.status(200).json({
        status: "success",
        message: `${count} ta bildirishnoma o'qildi`,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Delete all notifications
   */
  async deleteAll(req: Request, res: Response, next: NextFunction) {
    try {
      const managerId = req.user?.sub;

      if (!managerId) {
        return next(BaseError.BadRequest("Manager ID topilmadi"));
      }

      const count = await notificationService.deleteAllNotifications(managerId);

      return res.status(200).json({
        status: "success",
        message: `${count} ta bildirishnoma o'chirildi`,
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new NotificationController();
