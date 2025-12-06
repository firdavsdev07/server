import Notification from "../../schemas/notification.schema";
import { Types } from "mongoose";
import logger from "../../utils/logger";

class NotificationService {
  /**
   * Create notification for payment approval/rejection
   */
  async createPaymentNotification(data: {
    managerId: string;
    type: "PAYMENT_APPROVED" | "PAYMENT_REJECTED";
    paymentId: string;
    customerId: string;
    customerName: string;
    contractId: string;
    productName: string;
    amount: number;
    status: string;
    paymentType?: 'FULL' | 'PARTIAL' | 'EXCESS';
    monthNumber?: number;
    currencyDetails?: { dollar: number; sum: number };
  }) {
    try {
      const title =
        data.type === "PAYMENT_APPROVED"
          ? "✅ To'lov tasdiqlandi"
          : "❌ To'lov rad qilindi";

      // Aralash to'lov ma'lumotini formatlash
      const formatPaymentDetails = (amount: number, status: string, currencyDetails?: { dollar: number; sum: number }, paymentType?: string, monthNumber?: number) => {
        let paymentInfo = '';
        
        // Currency details bilan format
        if (currencyDetails && (currencyDetails.dollar > 0 || currencyDetails.sum > 0)) {
          if (currencyDetails.dollar > 0 && currencyDetails.sum > 0) {
            paymentInfo = `$${currencyDetails.dollar.toFixed(2)} + ${currencyDetails.sum.toLocaleString()} so'm (jami: $${amount.toFixed(2)})`;
          } else if (currencyDetails.dollar > 0) {
            paymentInfo = `$${currencyDetails.dollar.toFixed(2)}`;
          } else {
            paymentInfo = `${currencyDetails.sum.toLocaleString()} so'm ($${amount.toFixed(2)} ekvivalent)`;
          }
        } else {
          paymentInfo = `$${amount.toFixed(2)}`;
        }

        // Status qo'shish
        if (status === 'OVERPAID') {
          paymentInfo += ' (ko\'p to\'lov)';
        } else if (status === 'UNDERPAID') {
          paymentInfo += ' (kam to\'lov)';
        }

        // Oy raqami qo'shish
        if (monthNumber) {
          paymentInfo += ` - ${monthNumber}-oy uchun`;
        }

        return paymentInfo;
      };

      const paymentDetails = formatPaymentDetails(data.amount, data.status, data.currencyDetails, data.paymentType, data.monthNumber);

      const message =
        data.type === "PAYMENT_APPROVED"
          ? `${data.customerName} mijozning ${data.productName} mahsuloti uchun ${paymentDetails} to'lovi tasdiqlandi.`
          : `${data.customerName} mijozning ${data.productName} mahsuloti uchun ${paymentDetails} to'lovi rad qilindi.`;

      const notification = await Notification.create({
        managerId: new Types.ObjectId(data.managerId),
        type: data.type,
        title,
        message,
        data: {
          paymentId: new Types.ObjectId(data.paymentId),
          customerId: new Types.ObjectId(data.customerId),
          customerName: data.customerName,
          contractId: new Types.ObjectId(data.contractId),
          productName: data.productName,
          amount: data.amount,
          status: data.status,
          paymentType: data.paymentType,
          monthNumber: data.monthNumber,
        },
        isRead: false,
      });

      logger.info("📬 Notification created:", {
        id: notification._id,
        manager: data.managerId,
        type: data.type,
      });

      return notification;
    } catch (error) {
      logger.error("❌ Failed to create notification:", error);
      throw error;
    }
  }

  /**
   * Get all notifications for a manager
   */
  async getNotifications(managerId: string, limit: number = 50) {
    try {
      const notifications = await Notification.find({
        managerId: new Types.ObjectId(managerId),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return notifications;
    } catch (error) {
      logger.error("❌ Failed to get notifications:", error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(managerId: string) {
    try {
      const count = await Notification.countDocuments({
        managerId: new Types.ObjectId(managerId),
        isRead: false,
      });

      return count;
    } catch (error) {
      logger.error("❌ Failed to get unread count:", error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string) {
    try {
      await Notification.findByIdAndUpdate(notificationId, {
        isRead: true,
      });

      logger.info("✅ Notification marked as read:", notificationId);
    } catch (error) {
      logger.error("❌ Failed to mark as read:", error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(managerId: string) {
    try {
      const result = await Notification.updateMany(
        {
          managerId: new Types.ObjectId(managerId),
          isRead: false,
        },
        {
          isRead: true,
        }
      );

      logger.info("✅ All notifications marked as read:", {
        manager: managerId,
        count: result.modifiedCount,
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error("❌ Failed to mark all as read:", error);
      throw error;
    }
  }

  /**
   * Delete all notifications for a manager
   */
  async deleteAllNotifications(managerId: string) {
    try {
      const result = await Notification.deleteMany({
        managerId: new Types.ObjectId(managerId),
      });

      logger.info("🗑️ All notifications deleted:", {
        manager: managerId,
        count: result.deletedCount,
      });

      return result.deletedCount;
    } catch (error) {
      logger.error("❌ Failed to delete notifications:", error);
      throw error;
    }
  }
}

export default new NotificationService();
