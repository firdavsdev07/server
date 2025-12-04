// import User from "../schemas/user.schema";
import { RoleEnum } from "../enums/role.enum";
import { Permission } from "../enums/permission.enum";
import Auth from "../schemas/auth.schema";
import bcrypt from "bcryptjs";
import Employee from "../schemas/employee.schema";
import { Role } from "../schemas/role.schema";
import logger from "../utils/logger";

const createSuperAdmin = async () => {
  try {
    const ADMIN_FIRSTNAME = process.env.ADMIN_FIRSTNAME;
    const ADMIN_LASTNAME = process.env.ADMIN_LASTNAME;
    const ADMIN_PHONENUMBER = process.env.ADMIN_PHONENUMBER;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (
      !ADMIN_FIRSTNAME ||
      !ADMIN_LASTNAME ||
      !ADMIN_PHONENUMBER ||
      !ADMIN_PASSWORD
    ) {
      throw new Error(
        "Environment variables ADMIN_EMAIL or ADMIN_PASSWORD are missing"
      );
    }

    const existingAdmin = await Employee.findOne({
      phoneNumber: ADMIN_PHONENUMBER,
    });

    if (!existingAdmin) {
      const adminRole = await Role.findOne({ name: RoleEnum.ADMIN });

      if (!adminRole) {
        throw new Error(
          "Admin role not found. Make sure roles are seeded first."
        );
      }

      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

      const auth = new Auth({
        password: hashedPassword,
      });
      await auth.save();
      const superAdmin = new Employee({
        firstName: ADMIN_FIRSTNAME,
        lastName: ADMIN_LASTNAME,
        phoneNumber: ADMIN_PHONENUMBER,
        role: adminRole._id,
        auth: auth._id,
        isActive: true,
        permissions: Object.values(Permission),
      });

      await superAdmin.save();
      logger.debug("Super Admin created");
    } else {
      // Mavjud super adminga barcha permissionlarni berish
      const allPermissions = Object.values(Permission);
      if (existingAdmin.permissions.length < allPermissions.length) {
        existingAdmin.permissions = allPermissions;
        await existingAdmin.save();
        logger.debug(
          `Super Admin permissions updated: ${existingAdmin.permissions.length}/${allPermissions.length}`
        );
      } else {
        logger.debug(
          `Super Admin already has all permissions: ${existingAdmin.permissions.length}/${allPermissions.length}`
        );
      }
    }
  } catch (error) {
    logger.error("Error creating Super Admin:", error);
  }
};

export default createSuperAdmin;
