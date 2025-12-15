import { Router } from "express";

import authRoute from "./auth.routes";
import dashboardRoute from "./dashboard.routes";
import employeeRoute from "./employee.routes";
import customerRoute from "./customer.routes";
import contractRoute from "./contract.routes";
import debtorRoute from "./debtor.routes";
import cashRoute from "./cash.routes";
import paymentRoute from "./payment.routes";
import expenseRoute from "./expenses.routes";
import fileRoute from "./file.routes";
import excelImportRoute from "./excel-import.routes";
import resetRoute from "./reset.routes";
import auditLogRoute from "./audit-log.routes";

const routes = Router();

routes.use("/auth", authRoute);
routes.use("/dashboard", dashboardRoute);
routes.use("/employee", employeeRoute);
routes.use("/customer", customerRoute);
routes.use("/contract", contractRoute);
routes.use("/debtor", debtorRoute);
routes.use("/cash", cashRoute);
routes.use("/payment", paymentRoute);
routes.use("/expense", expenseRoute);
routes.use("/file", fileRoute);
routes.use("/excel", excelImportRoute);
routes.use("/reset", resetRoute);
routes.use("/audit", auditLogRoute);

export default routes;
