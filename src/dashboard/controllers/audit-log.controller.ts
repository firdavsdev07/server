import { Request, Response, NextFunction } from "express";
import auditLogService from "../../services/audit-log.service";
import { AuditAction, AuditEntity } from "../../schemas/audit-log.schema";
import IJwtUser from "../../types/user";
import BaseError from "../../utils/base.error";
import dayjs from "dayjs";

class AuditLogController {
  /**
   * Kunlik aktivlik olish
   * GET /api/audit/daily?date=2024-12-10
   */
  async getDailyActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      // Faqat admin va moderator ko'ra oladi
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      // Date parametrini parse qilish
      const dateParam = req.query.date as string;
      
      // ✅ TIMEZONE FIX: O'zbekiston vaqt zonasi (UTC+5)
      const { parseUzbekistanDate, getUzbekistanDayEnd } = await import("../../utils/helpers/date.helper");
      
      let selectedDate: Date;
      if (dateParam) {
        // dateParam format: "2024-12-18"
        selectedDate = parseUzbekistanDate(dateParam);
        
        // Debug log
        console.log('🔍 Audit Log Query:', {
          dateParam,
          startDate: selectedDate.toISOString(),
          endDate: getUzbekistanDayEnd(dateParam).toISOString(),
        });
      } else {
        selectedDate = new Date();
      }
      
      if (isNaN(selectedDate.getTime())) {
        return next(BaseError.BadRequest("Noto'g'ri sana formati"));
      }

      // Limit parametri (default: 100, max: 500)
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const limit = Math.min(limitParam, 500); // Max 500 ta yozuv
      
      const activities = await auditLogService.getDailyActivity(selectedDate, limit);
      
      // Debug log - qaytarilgan ma'lumotlar
      console.log('📊 Audit Log Result:', {
        dateParam,
        foundLogs: activities.length,
        firstLog: activities[0]?.timestamp,
        lastLog: activities[activities.length - 1]?.timestamp,
      });

      res.status(200).json({
        status: "success",
        message: "Kunlik aktivlik muvaffaqiyatli olindi",
        data: {
          date: dayjs(selectedDate).format("YYYY-MM-DD"),
          activities,
          total: activities.length,
          limit,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Activity statistics olish
   * GET /api/audit/stats?start=2024-12-01&end=2024-12-31
   */
  async getActivityStats(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      const startParam = req.query.start as string;
      const endParam = req.query.end as string;

      // Default: oxirgi 30 kun
      const endDate = endParam ? new Date(endParam) : new Date();
      const startDate = startParam ? new Date(startParam) : dayjs().subtract(30, 'day').toDate();

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return next(BaseError.BadRequest("Noto'g'ri sana formati"));
      }

      const stats = await auditLogService.getActivityStats(startDate, endDate);

      res.status(200).json({
        status: "success",
        message: "Statistika muvaffaqiyatli olindi",
        data: {
          period: {
            start: dayjs(startDate).format("YYYY-MM-DD"),
            end: dayjs(endDate).format("YYYY-MM-DD"),
          },
          stats,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Entity history olish
   * GET /api/audit/entity/:entityType/:entityId
   */
  async getEntityHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      const { entityType, entityId } = req.params;

      // Entity type validation
      if (!Object.values(AuditEntity).includes(entityType as AuditEntity)) {
        return next(BaseError.BadRequest("Noto'g'ri entity turi"));
      }

      const history = await auditLogService.getEntityHistory(
        entityType as AuditEntity,
        entityId
      );

      res.status(200).json({
        status: "success",
        message: "Entity history muvaffaqiyatli olindi",
        data: {
          entityType,
          entityId,
          history,
          total: history.length,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * User activity olish
   * GET /api/audit/user/:userId?limit=50
   */
  async getUserActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const activity = await auditLogService.getUserActivity(userId, limit);

      res.status(200).json({
        status: "success",
        message: "User activity muvaffaqiyatli olindi",
        data: {
          userId,
          activity,
          total: activity.length,
          limit,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Filtrlangan aktivlik olish
   * GET /api/audit/filter?date=2024-12-10&entity=customer&action=CREATE&userId=...
   */
  async getFilteredActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      const {
        date,
        entity,
        action,
        userId,
        limit = "100",
        page = "1",
      } = req.query as {
        date?: string;
        entity?: string;
        action?: string;
        userId?: string;
        limit?: string;
        page?: string;
      };

      // Date range
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (date) {
        // ✅ TIMEZONE FIX: O'zbekiston vaqt zonasi (UTC+5)
        const { getUzbekistanDayStart, getUzbekistanDayEnd } = await import("../../utils/helpers/date.helper");
        startDate = getUzbekistanDayStart(date);
        endDate = getUzbekistanDayEnd(date);
      }

      // Query building
      const query: any = {};
      
      if (startDate && endDate) {
        query.timestamp = { $gte: startDate, $lte: endDate };
      }
      
      if (entity && Object.values(AuditEntity).includes(entity as AuditEntity)) {
        query.entity = entity;
      }
      
      if (action && Object.values(AuditAction).includes(action as AuditAction)) {
        query.action = action;
      }
      
      if (userId) {
        query.userId = userId;
      }

      // Pagination
      const limitNum = parseInt(limit);
      const pageNum = parseInt(page);
      const skip = (pageNum - 1) * limitNum;

      // Ma'lumotlarni olish
      const AuditLog = (await import("../../schemas/audit-log.schema")).default;
      
      const [activities, total] = await Promise.all([
        AuditLog.find(query)
          .populate("userId", "firstName lastName role")
          .sort({ timestamp: -1 })
          .limit(limitNum)
          .skip(skip)
          .lean(),
        AuditLog.countDocuments(query),
      ]);

      res.status(200).json({
        status: "success",
        message: "Filtrlangan aktivlik muvaffaqiyatli olindi",
        data: {
          activities,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
          filters: { date, entity, action, userId },
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Dashboard uchun bugungi aktivlik summary
   * GET /api/audit/today-summary
   */
  async getTodaySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;
      
      if (!["admin", "moderator"].includes(user.role)) {
        return next(BaseError.ForbiddenError("Sizda audit log ko'rish huquqi yo'q"));
      }

      const today = new Date();
      const activities = await auditLogService.getDailyActivity(today, 50); // Faqat 50 ta

      // Summary statistics
      const summary = {
        totalActivities: activities.length,
        customers: {
          created: activities.filter(a => a.action === "CREATE" && a.entity === "customer").length,
          updated: activities.filter(a => a.action === "UPDATE" && a.entity === "customer").length,
        },
        contracts: {
          created: activities.filter(a => a.action === "CREATE" && a.entity === "contract").length,
          updated: activities.filter(a => a.action === "UPDATE" && a.entity === "contract").length,
        },
        payments: {
          total: activities.filter(a => a.action === "PAYMENT" && a.entity === "payment").length,
          confirmed: activities.filter(a => a.action === "CONFIRM" && a.entity === "payment").length,
          rejected: activities.filter(a => a.action === "REJECT" && a.entity === "payment").length,
        },
        excel_imports: activities.filter(a => a.action === "BULK_IMPORT" && a.entity === "excel_import").length,
        users: {
          active: [...new Set(activities.map(a => a.userId))].length,
          logins: activities.filter(a => a.action === "LOGIN").length,
        },
      };

      res.status(200).json({
        status: "success",
        message: "Bugungi aktivlik summary muvaffaqiyatli olindi",
        data: {
          date: dayjs(today).format("YYYY-MM-DD"),
          summary,
          recentActivities: activities.slice(0, 10), // So'nggi 10 ta
        },
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new AuditLogController();