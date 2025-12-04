import BaseError from "../../utils/base.error";
import bcrypt from "bcryptjs";
import { LoginDto } from "../../validators/auth";
import Employee from "../../schemas/employee.schema";
import IJwtUser from "../../types/user";
import jwt from "../../utils/jwt";
import IEmployeeData from "../../types/employeeData";

class AuthService {
  async login(data: LoginDto) {
    const { phoneNumber } = data;
    const employee = await Employee.findOne({ phoneNumber })
      .populate("auth")
      .populate("role");

    if (!employee) {
      throw BaseError.BadRequest("parol yoki telefon raqam xato!");
    }

    const authEmployee = employee.auth;

    const isMatched = await bcrypt.compare(
      data.password,
      authEmployee.password || ""
    );

    if (!isMatched) {
      throw BaseError.BadRequest("parol yoki telefon raqam xato!");
    }

    const employeeData: IEmployeeData = {
      id: employee.id,
      firstname: employee.firstName,
      lastname: employee.lastName,
      phoneNumber: employee.phoneNumber,
      telegramId: employee.telegramId,
      role: employee.role.name,
    };

    const employeeDto: IJwtUser = {
      sub: employee.id.toString(),
      name: employee.firstName,
      role: employee.role.name,
    };
    const token = jwt.sign(employeeDto);
    return { profile: employeeData, ...token };
  }

  async getUser(token: IJwtUser) {
    const employee = await Employee.findById(token.sub).populate("role");
    if (!employee) {
      throw BaseError.UnauthorizedError();
    }
    const userData: IEmployeeData = {
      id: employee.id,

      firstname: employee.firstName,
      lastname: employee.lastName,
      phoneNumber: employee.phoneNumber,
      telegramId: employee.telegramId,
      role: employee.role.name,
    };

    return { profile: userData };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw BaseError.UnauthorizedError();
    }

    const userPayload = jwt.validateRefreshToken(refreshToken);
    if (!userPayload) {
      throw BaseError.UnauthorizedError();
    }

    const employee = await Employee.findById(userPayload.sub)
      .populate("role")
      .populate("auth");

    if (!employee || !employee.role) {
      throw BaseError.UnauthorizedError();
    }

    const employeeData: IEmployeeData = {
      id: employee.id,
      firstname: employee.firstName,
      lastname: employee.lastName,
      phoneNumber: employee.phoneNumber,
      telegramId: employee.telegramId,
      role: employee.role.name,
    };

    const employeeDto: IJwtUser = {
      sub: employee.id.toString(),
      name: employee.firstName,
      role: employee.role.name,
    };

    const accessToken = jwt.signrefresh(employeeDto);
    return { profile: employeeData, accessToken };
  }
}

export default new AuthService();
