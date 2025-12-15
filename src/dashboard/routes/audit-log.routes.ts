import { Router } from "express";
import auditLogController from "../controllers/audit-log.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Barcha audit log route'lari authentication talab qiladi
 */
router.use(authenticate);

/**
 * @route GET /api/dashboard/audit/today-summary
 * @desc Bugungi aktivlik summary
 * @access Admin, Moderator
 */
router.get("/today-summary", auditLogController.getTodaySummary);

/**
 * @route GET /api/dashboard/audit/daily
 * @desc Kunlik aktivlik olish
 * @query date - YYYY-MM-DD format (optional, default: bugun)
 * @access Admin, Moderator
 */
router.get("/daily", auditLogController.getDailyActivity);

/**
 * @route GET /api/dashboard/audit/stats
 * @desc Activity statistika olish
 * @query start - Start date (YYYY-MM-DD format)
 * @query end - End date (YYYY-MM-DD format)
 * @access Admin, Moderator
 */
router.get("/stats", auditLogController.getActivityStats);

/**
 * @route GET /api/dashboard/audit/filter
 * @desc Filtrlangan aktivlik olish
 * @query date - YYYY-MM-DD format
 * @query entity - customer|contract|payment|employee|balance|auth|excel_import
 * @query action - CREATE|UPDATE|DELETE|PAYMENT|BULK_IMPORT|LOGIN|LOGOUT|STATUS_CHANGE|POSTPONE|CONFIRM|REJECT
 * @query userId - User ID
 * @query limit - Results per page (default: 100)
 * @query page - Page number (default: 1)
 * @access Admin, Moderator
 */
router.get("/filter", auditLogController.getFilteredActivity);

/**
 * @route GET /api/dashboard/audit/entity/:entityType/:entityId
 * @desc Entity history olish
 * @param entityType - customer|contract|payment|employee|balance|auth|excel_import
 * @param entityId - Entity ID
 * @access Admin, Moderator
 */
router.get("/entity/:entityType/:entityId", auditLogController.getEntityHistory);

/**
 * @route GET /api/dashboard/audit/user/:userId
 * @desc User activity olish
 * @param userId - User ID
 * @query limit - Limit (default: 50)
 * @access Admin, Moderator
 */
router.get("/user/:userId", auditLogController.getUserActivity);

export default router;