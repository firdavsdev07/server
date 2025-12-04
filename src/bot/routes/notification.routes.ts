import { Router } from "express";
import notificationController from "../controllers/notification.controller";

const router = Router();

// Get all notifications
router.get("/", notificationController.getNotifications);

// Get unread count
router.get("/unread-count", notificationController.getUnreadCount);

// Mark notification as read
router.patch("/:id/read", notificationController.markAsRead);

// Mark all as read
router.patch("/read-all", notificationController.markAllAsRead);

// Delete all notifications
router.delete("/all", notificationController.deleteAll);

export default router;
