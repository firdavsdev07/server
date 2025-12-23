import { Router } from "express";

import authRoute from "./auth.routes";
import customerRoute from "./customer.routes";
import paymentRoute from "./payment.routes";
import dashboardRoute from "./dashboard.routes";
import notesRoute from "./notes.routes";
import expensesRoute from "./expenses.routes";
import contractRoute from "./contract.routes";
import notificationRoute from "./notification.routes";
import { botManager } from "../../middlewares/botManager.middleware";

const routes = Router();

routes.use("/auth", authRoute);
// routes.use("/user", userRoute);
routes.use(
  "/customer",
  botManager,
  customerRoute
);
routes.use(
  "/payment",
  botManager,
  paymentRoute
);
routes.use(
  "/contract",
  botManager,
  contractRoute
);
routes.use(
  "/dashboard",
  botManager,
  dashboardRoute
);
routes.use(
  "/notes",
  botManager,
  notesRoute
);
routes.use(
  "/expenses",
  botManager,
  expensesRoute
);
routes.use(
  "/notifications",
  botManager,
  notificationRoute
);

export default routes;
