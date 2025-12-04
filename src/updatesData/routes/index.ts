import { Router } from "express";

import uploadRoute from "./uploads.routes";

const routes = Router();

routes.use("/csv", uploadRoute);

export default routes;
