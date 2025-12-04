import Employee from "../../schemas/employee.schema";

class UserService {
  async check(telegramId: string) {
    const employee = await Employee.findOne({
      telegramId: telegramId,
      isActive: true,
      isDeleted: false,
    });

    return {
      status: "ok",
      employee,
    };
  }
  async phone(telegramId: string, phoneNumber: string) {
    const employee = await Employee.findOne({
      phoneNumber: phoneNumber,
      isActive: true,
      isDeleted: false,
    });

    if (!employee) {
      return {
        status: "error",
      };
    }
    employee.telegramId = telegramId;
    await employee.save();
    return {
      status: "ok",
      employee,
    };
  }
}

export default new UserService();
