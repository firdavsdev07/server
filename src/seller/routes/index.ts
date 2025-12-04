import { Router } from "express";

import customerRoute from "./customer.routes";
import contractRoute from "./contract.routes";

const routes = Router();

routes.use("/customer", customerRoute);
routes.use("/contract", contractRoute);

export default routes;
