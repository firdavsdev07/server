import { RoleEnum } from "../enums/role.enum";

type IEmployeeData = {
  id: string;
  firstname: string;
  lastname: string;
  phoneNumber: string;
  telegramId: string;
  role: RoleEnum;
};
export default IEmployeeData;
