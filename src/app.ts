import express, { NextFunction, Request, Response } from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import logger from "./utils/logger";
import routes from "./dashboard/routes/index";
import routesSeller from "./seller/routes/index";
import routesBot from "./bot/routes/index";
import path from "path";

import uploadsCsv from "./updatesData/routes/index";

//middleware
import ErrorMiddleware from "./middlewares/error.middleware";

// Monitoring
import {
  healthCheck,
  livenessProbe,
  readinessProbe,
} from "./monitoring/health-check";
import { getMetrics, metricsMiddleware } from "./monitoring/metrics";

const app = express();
const BotHostUrl = process.env.BOT_HOST_URL;
const dashbordHostUrl = process.env.DASHBOARD_HOST_URL;
const botWebAppUrl = process.env.BOT_WEB_APP_URL;

if (!dashbordHostUrl || !BotHostUrl) {
  throw new Error(
    "DASHBOARD_HOST_URL or BOT_HOST_URL is not defined in environment variables"
  );
}

// CORS configuration
const allowedOrigins = [
  dashbordHostUrl,
  BotHostUrl,
  "http://localhost:5174",
  "http://localhost:5173",
];

if (botWebAppUrl) {
  allowedOrigins.push(botWebAppUrl);
}

if (process.env.NODE_ENV === "development") {
  allowedOrigins.push("http://localhost:5174");
  allowedOrigins.push("http://localhost:5173");
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  logger.debug(
    `Request: ${req.method} ${req.path} from origin: ${origin || "no-origin"}`
  );
  next();
});

app.use(
  cors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (process.env.NODE_ENV === "development" && origin.includes("ngrok")) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "ngrok-skip-browser-warning",
    ],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400, // 24 hours
  })
);

app.use(express.json());
app.use(cookieParser());

// Metrics middleware
app.use(metricsMiddleware);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check endpoints
app.get("/health", healthCheck);
app.get("/health/live", livenessProbe);
app.get("/health/ready", readinessProbe);

// Metrics endpoint
app.get("/api/metrics", getMetrics);

// Global request logger
app.use((req, res, next) => {
  if (
    req.path.includes("/payment/pay-all-remaining") ||
    req.path.includes("/payment/contract")
  ) {
    logger.debug("🔑 Headers:", {
      contentType: req.headers["content-type"],
      authorization: req.headers.authorization?.substring(0, 30) + "...",
    });
    logger.debug("========================");
  }
  next();
});

app.use("/upl", uploadsCsv);
app.use("/api", routes);
app.use("/api/seller", routesSeller);
app.use("/api/bot", routesBot);

const botDistPath = path.join(__dirname, "../../bot/dist");

app.use(
  "/bot",
  express.static(botDistPath, {
    index: "index.html",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css");
      } else if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript");
      }
    },
  })
);

// Telegram webhook endpoint
import bot from "./bot/main";
app.post("/telegram-webhook", (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.get("/", (req, res) => {
  res.json({ test: "nasiya server" });
});
//middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  ErrorMiddleware(err, req, res, next);
});

app.set("trust proxy", 1);

export default app;
