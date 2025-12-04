import { Request, Response, NextFunction } from "express";
import authService from "../services/auth.service";
import { plainToInstance } from "class-transformer";
import { LoginDto } from "../../validators/auth";
import { handleValidationErrors } from "../../validators/format";
import { validate } from "class-validator";
import BaseError from "../../utils/base.error";
import { profile } from "console";
import logger from "../../utils/logger";

class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const loginData = plainToInstance(LoginDto, req.body || {});

      const errors = await validate(loginData);

      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest(
            "Ma'lumotlar tekshiruvdan o'tmadi",
            formattedErrors
          )
        );
      }

      const data = await authService.login(loginData);

      // Cookie sozlamalari
      const isProduction = process.env.NODE_ENV === "production";
      const isNgrok = req.headers.host?.includes("ngrok");

      const cookieOptions: any = {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 kun
        path: "/",
        secure: isProduction || isNgrok, // HTTPS production yoki ngrok'da
        sameSite: isProduction || isNgrok ? "none" : "lax", // Cross-site production yoki ngrok'da
      };

      logger.debug("🍪 === SETTING COOKIE ===");
      logger.debug("📍 Origin:", req.headers.origin);
      logger.debug("📍 Host:", req.headers.host);
      logger.debug("🔧 NODE_ENV:", process.env.NODE_ENV);
      logger.debug("🔧 Is Ngrok:", isNgrok);
      logger.debug("⚙️ Cookie options:", cookieOptions);
      logger.debug("🔑 Token (first 20 chars):", data.refreshToken.substring(0, 20) + "...");

      res.cookie("refresh_token", data.refreshToken, cookieOptions);

      logger.debug("✅ Cookie set successfully");
      logger.debug("📤 Response headers will include Set-Cookie");

      // ✅ accessToken ham qaytarish (frontend localStorage'ga saqlaydi)
      res.json({
        profile: data.profile,
        accessToken: data.accessToken,
        token: data.accessToken // backward compatibility
      });
    } catch (error) {
      return next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (user) {
        const data = await authService.getUser(user);
        res.json(data);
      }
    } catch (error) {
      return next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refresh_token } = req.cookies;

      // Debug: Cookie tekshirish
      logger.debug("🔍 === REFRESH REQUEST ===");
      logger.debug("📍 Origin:", req.headers.origin);
      logger.debug("📦 All Cookies:", req.cookies);
      logger.debug("📋 Cookie Header:", req.headers.cookie);
      logger.debug("🔑 Refresh token:", refresh_token ? "exists" : "missing");

      if (!refresh_token) {
        logger.debug("❌ No refresh token in cookies");
        logger.debug("💡 Hint: Check if cookie was set during login");
        logger.debug("💡 Hint: Check if withCredentials: true in frontend");
        logger.debug("💡 Hint: Check CORS credentials: true in backend");
        return next(BaseError.UnauthorizedError("Refresh token topilmadi"));
      }

      const data = await authService.refresh(refresh_token);
      logger.debug("✅ Refresh successful");
      logger.debug("📦 Returning profile:", data.profile.firstname);

      res.json(data);
    } catch (error) {
      logger.debug("❌ Refresh failed:", error);
      return next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      // Cookie'ni tozalash - login paytidagi sozlamalar bilan
      const isProduction = process.env.NODE_ENV === "production";
      const isNgrok = req.headers.host?.includes("ngrok");

      res.clearCookie("refresh_token", {
        httpOnly: true,
        path: "/",
        secure: isProduction || isNgrok,
        sameSite: isProduction || isNgrok ? "none" : "lax",
      });

      logger.debug("✅ Logout successful, cookie cleared");
      res.json({ message: "Log out successful" });
    } catch (error) {
      return next(error);
    }
  }
}
export default new AuthController();
