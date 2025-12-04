import { Request, Response, NextFunction } from "express";
import Employee from "../schemas/employee.schema";
import BaseError from "../utils/base.error";
import jwt from "../utils/jwt";
// import { RoleEnum } from "../enums/role.enum";

export const botManager = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return next(BaseError.UnauthorizedError());
    }
    const accessToken = auth.split(" ")[1];
    if (!accessToken) {
      return next(BaseError.UnauthorizedError());
    }

    // 🔧 DEVELOPMENT: Mock token bypass
    if (process.env.NODE_ENV === "development" && accessToken.startsWith("mock_token_")) {
      const employeeId = accessToken.replace("mock_token_", "");
      const employee = await Employee.findById(employeeId).populate("role").exec();
      
      if (!employee) {
        console.log("❌ Mock employee not found:", employeeId);
        return next(BaseError.UnauthorizedError("Mock employee not found"));
      }

      const userRole = employee.role?.name;
      const allowedRoles = ["manager", "seller", "admin", "moderator"];
      
      if (!allowedRoles.includes(userRole || "")) {
        console.log("❌ Mock user role not allowed:", userRole);
        return next(BaseError.ForbiddenError());
      }

      req.user = {
        sub: employee._id.toString(),
        _id: employee._id.toString(),
        role: userRole,
        name: `${employee.firstName} ${employee.lastName}`,
      } as any;
      
      console.log("🔧 Mock bot auth: Employee authenticated", {
        id: employee._id,
        role: userRole,
        name: req.user.name,
      });
      
      return next();
    }

    const userData = jwt.validateAccessToken(accessToken);
    if (!userData) {
      return next(BaseError.UnauthorizedError());
    }

    const user = await Employee.findById(userData.sub).populate("role").exec();

    if (!user) return next(BaseError.UnauthorizedError());

    const userRole = user.role?.name;

    // Manager va Seller rollariga ruxsat berish
    const allowedRoles = ["manager", "seller", "admin", "moderator"];
    if (!allowedRoles.includes(userRole || "")) {
      return next(BaseError.ForbiddenError());
    }

    req.user = userData;
    return next();
  } catch (error) {
    return next(BaseError.UnauthorizedError());
  }
};
