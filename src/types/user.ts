import { RoleEnum } from "../enums/role.enum";

type IJwtUser = {
  sub: string;
  name: string;
  role: RoleEnum;
};
export default IJwtUser;
