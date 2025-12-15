import BaseError from "../../utils/base.error";
import Auth from "../../schemas/auth.schema";
import Customer, { ICustomer } from "../../schemas/customer.schema";
import logger from "../../utils/logger";
import auditLogService from "../../services/audit-log.service";
import {
  CreateCustomerDto,
  SellerCreateCustomerDto,
  UpdateCustomerDto,
  UpdateManagerDto,
} from "../../validators/customer";
import IJwtUser from "../../types/user";
import Employee from "../../schemas/employee.schema";
import Contract from "../../schemas/contract.schema";
import { Types } from "mongoose";

class CustomerService {
  async getAllCustomer() {
    const filter: any = { isDeleted: false };
    return await Customer.find(filter)
      .populate({
        path: "manager",
        select: "firstName lastName _id isDeleted",
      })
      .sort({ createdAt: -1 });
  }

  async getAll() {
    return await Customer.aggregate([
      {
        $match: {
          isActive: true,
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "employees",
          localField: "manager",
          foreignField: "_id",
          as: "manager",
        },
      },
      {
        $unwind: {
          path: "$manager",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "contracts",
          localField: "_id",
          foreignField: "customer",
          as: "contracts",
        },
      },
      {
        $addFields: {
          contractCount: { $size: "$contracts" },
        },
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          phoneNumber: 1,
          address: 1,
          passportSeries: 1,
          birthDate: 1,
          createdAt: 1,
          manager: {
            $ifNull: [
              {
                _id: "$manager._id",
                firstName: "$manager.firstName",
                lastName: "$manager.lastName",
              },
              null,
            ],
          },
          contractCount: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  }

  async getAllNew() {
    const query: any = {
      isDeleted: false,
      isActive: false,
    };
    const customers = await Customer.find(query).sort({ createdAt: -1 });
    return customers;
  }

  async getCustomerById(customerId: string) {
    interface ICustomerWithContract extends ICustomer {
      contracts: any[];
    }
    const customer = await Customer.findOne({
      _id: customerId,
    })
      .populate({
        path: "manager",
        select: "firstName lastName _id isDeleted",
      })
      .populate({
        path: "editHistory.editedBy",
        select: "firstName lastName _id",
      });

    if (!customer) {
      throw BaseError.BadRequest("Customer topilmadi");
    }

    const customerWithContract =
      customer.toObject() as unknown as ICustomerWithContract;
    customerWithContract.contracts = await Contract.aggregate([
      {
        $match: {
          isDeleted: false,
          isActive: true,
          customer: new Types.ObjectId(customerId),
        },
      },
      {
        $lookup: {
          from: "notes",
          localField: "notes",
          foreignField: "_id",
          as: "notes",
          pipeline: [{ $project: { text: 1 } }],
        },
      },
      {
        $addFields: {
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "payments",
          foreignField: "_id",
          as: "payments",
          pipeline: [
            {
              $lookup: {
                from: "notes",
                localField: "notes",
                foreignField: "_id",
                as: "notes",
                pipeline: [{ $project: { text: 1 } }],
              },
            },
            {
              $addFields: {
                notes: {
                  $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, ""],
                },
              },
            },
            {
              $project: {
                _id: 1,
                amount: 1,
                date: 1,
                isPaid: 1,
                paymentType: 1,
                status: 1,
                remainingAmount: 1,
                excessAmount: 1,
                expectedAmount: 1,
                notes: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    as: "p",
                    cond: { $eq: ["$$p.isPaid", true] }
                  },
                },
                as: "pp",
                in: "$$pp.amount",
              },
            },
          },
        },
      },
      {
        $addFields: {
          remainingDebt: {
            $subtract: ["$totalPrice", "$totalPaid"],
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return customerWithContract;
  }

  async checkPhone(phone: string) {
    const exists = await Customer.findOne({ phoneNumber: "+" + phone });
    return { exists: Boolean(exists) };
  }

  async checkPassport(passport: string) {
    const exists = await Customer.findOne({ passportSeries: passport });
    return { exists: Boolean(exists) };
  }

  async create(data: CreateCustomerDto, user: IJwtUser, files?: any) {
    const createBy = await Employee.findById(user.sub);
    if (!createBy) {
      throw BaseError.ForbiddenError();
    }
    if (data.phoneNumber) {
      const phoneExists = await Customer.findOne({
        phoneNumber: data.phoneNumber,
      });
      if (phoneExists) {
        throw BaseError.BadRequest(
          `Ushbu telefon raqami bilan mijoz allaqachon mavjud.`
        );
      }
    }
    if (data.passportSeries) {
      const passportExists = await Customer.findOne({
        passportSeries: data.passportSeries,
      });
      if (passportExists) {
        throw BaseError.BadRequest(
          "Ushbu passport seriyasi bilan mijoz allaqachon mavjud."
        );
      }
    }
    const auth = new Auth({});
    await auth.save();

    const customerFiles: any = {};
    if (files) {
      if (files.passport && files.passport[0]) {
        customerFiles.passport = files.passport[0].path;
      }
      if (files.shartnoma && files.shartnoma[0]) {
        customerFiles.shartnoma = files.shartnoma[0].path;
      }
      if (files.photo && files.photo[0]) {
        customerFiles.photo = files.photo[0].path;
      }
    }

    const customer = new Customer({
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      address: data.address,
      passportSeries: data.passportSeries,
      birthDate: data.birthDate,
      manager: data.managerId,
      auth,
      isActive: true,
      createBy,
      files: customerFiles,
    });
    await customer.save();
    
    // 🔍 AUDIT LOG: Customer yaratish
    await auditLogService.logCustomerCreate(
      customer._id.toString(),
      `${data.firstName} ${data.lastName}`,
      user.sub
    );
    
    return { message: "Mijoz yaratildi.", customer };
  }

  async update(data: UpdateCustomerDto, files?: any, user?: any) {
    const customer = await Customer.findOne({
      _id: data.id,
      isDeleted: false,
    });

    if (!customer) {
      throw BaseError.NotFoundError("Mijoz topilmadi.");
    }

    // ✅ Tahrirlash tarixini yig'ish
    const changes: any[] = [];

    if (data.firstName && data.firstName !== customer.firstName) {
      changes.push({
        field: "Ism",
        oldValue: customer.firstName,
        newValue: data.firstName,
      });
    }

    if (data.lastName && data.lastName !== customer.lastName) {
      changes.push({
        field: "Familiya",
        oldValue: customer.lastName,
        newValue: data.lastName,
      });
    }

    if (data.phoneNumber && data.phoneNumber !== customer.phoneNumber) {
      changes.push({
        field: "Telefon",
        oldValue: customer.phoneNumber,
        newValue: data.phoneNumber,
      });
    }

    if (
      data.passportSeries &&
      data.passportSeries !== customer.passportSeries
    ) {
      changes.push({
        field: "Passport",
        oldValue: customer.passportSeries,
        newValue: data.passportSeries,
      });
    }

    if (data.address && data.address !== customer.address) {
      changes.push({
        field: "Manzil",
        oldValue: customer.address,
        newValue: data.address,
      });
    }

    if (
      data.birthDate &&
      new Date(data.birthDate).getTime() !==
        new Date(customer.birthDate).getTime()
    ) {
      changes.push({
        field: "Tug'ilgan sana",
        oldValue: customer.birthDate,
        newValue: data.birthDate,
      });
    }

    if (data.managerId && data.managerId !== customer.manager?.toString()) {
      // Manager o'zgarishini to'liq ma'lumot bilan saqlash
      const oldManager = await Employee.findById(customer.manager);
      const newManager = await Employee.findById(data.managerId);

      changes.push({
        field: "Manager",
        oldValue: oldManager
          ? `${oldManager.firstName} ${oldManager.lastName || ""}`
          : customer.manager?.toString() || "—",
        newValue: newManager
          ? `${newManager.firstName} ${newManager.lastName || ""}`
          : data.managerId,
      });
    }

    const { deleteFile } = await import("../../middlewares/upload.middleware");
    if (files) {
      if (files.passport && files.passport[0] && customer.files?.passport) {
        deleteFile(customer.files.passport);
        changes.push({
          field: "Passport fayli",
          oldValue: "Eski fayl",
          newValue: "Yangi fayl",
        });
      }
      if (files.shartnoma && files.shartnoma[0] && customer.files?.shartnoma) {
        deleteFile(customer.files.shartnoma);
        changes.push({
          field: "Shartnoma fayli",
          oldValue: "Eski fayl",
          newValue: "Yangi fayl",
        });
      }
      if (files.photo && files.photo[0] && customer.files?.photo) {
        deleteFile(customer.files.photo);
        changes.push({
          field: "Foto",
          oldValue: "Eski fayl",
          newValue: "Yangi fayl",
        });
      }
    }

    const customerFiles: any = { ...customer.files };
    if (files) {
      if (files.passport && files.passport[0]) {
        customerFiles.passport = files.passport[0].path;
      }
      if (files.shartnoma && files.shartnoma[0]) {
        customerFiles.shartnoma = files.shartnoma[0].path;
      }
      if (files.photo && files.photo[0]) {
        customerFiles.photo = files.photo[0].path;
      }
    }

    // ✅ Tahrirlash tarixini qo'shish
    const editHistory = customer.editHistory || [];
    if (changes.length > 0 && user) {
      editHistory.push({
        date: new Date(),
        editedBy: user.sub,
        changes,
      });

      logger.info("📝 Customer edit history:", {
        customerId: customer._id,
        editedBy: user.sub,
        changesCount: changes.length,
      });

      // 🔍 AUDIT LOG: Customer tahrirlash
      await auditLogService.logCustomerUpdate(
        customer._id.toString(),
        `${customer.firstName} ${customer.lastName}`,
        changes,
        user.sub
      );
    }

    await Customer.findOneAndUpdate(
      { _id: data.id, isDeleted: false },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        passportSeries: data.passportSeries,
        phoneNumber: data.phoneNumber,
        birthDate: data.birthDate,
        address: data.address,
        manager: data.managerId,
        isActive: true,
        files: customerFiles,
        editHistory,
      }
    ).exec();

    return {
      message: "Mijoz ma'lumotlari yangilandi.",
      changesCount: changes.length,
    };
  }

  async delete(id: string) {
    const customer = await Customer.findById(id);
    if (!customer) {
      throw BaseError.NotFoundError("Mijoz topilmadi.");
    }

    const { deleteFile } = await import("../../middlewares/upload.middleware");
    if (customer.files) {
      if (customer.files.passport) {
        deleteFile(customer.files.passport);
      }
      if (customer.files.shartnoma) {
        deleteFile(customer.files.shartnoma);
      }
      if (customer.files.photo) {
        deleteFile(customer.files.photo);
      }
    }

    customer.isDeleted = true;
    await customer.save();

    return { message: "Mijoz o'chirildi." };
  }

  async restoration(id: string) {
    const customer = await Customer.findByIdAndUpdate(
      id,
      {
        isDeleted: false,
      },
      { new: true }
    ).exec();
    if (!customer) {
      throw BaseError.NotFoundError("Mijoz topilmadi.");
    }

    return { message: "Mijoz qayta tiklandi" };
  }

  async updateManager({ managerId, customerId }: UpdateManagerDto) {
    const mamagerExist = await Employee.findById(managerId);

    if (!mamagerExist) {
      return { status: "error", message: "Meneger topilmadi." };
    }

    const customer = await Customer.findByIdAndUpdate(customerId, {
      manager: mamagerExist,
    });

    if (!customer) {
      return { status: "error", message: "Mijoz topilmadi." };
    }

    return { status: "ok", message: "Menejer yangilandi" };
  }

  async confirmationCustomer({ managerId, customerId }: UpdateManagerDto) {
    const mamagerExist = await Employee.findById(managerId);

    if (!mamagerExist) {
      return { status: "error", message: "Meneger topilmadi." };
    }

    const customer = await Customer.findByIdAndUpdate(customerId, {
      manager: mamagerExist,
      isActive: true,
    });

    if (!customer) {
      return { status: "error", message: "Mijoz topilmadi." };
    }

    return { status: "ok", message: "Menejer yangilandi" };
  }

  async sellerCreate(
    data: SellerCreateCustomerDto,
    user: IJwtUser,
    files?: any
  ) {
    const createBy = await Employee.findById(user.sub);
    if (!createBy) {
      throw BaseError.ForbiddenError();
    }
    if (data.phoneNumber) {
      const phoneExists = await Customer.findOne({
        phoneNumber: data.phoneNumber,
      });
      if (phoneExists) {
        throw BaseError.BadRequest(
          `Ushbu telefon raqami bilan mijoz allaqachon mavjud.`
        );
      }
    }
    if (data.passportSeries) {
      const passportExists = await Customer.findOne({
        passportSeries: data.passportSeries,
      });
      if (passportExists) {
        throw BaseError.BadRequest(
          "Ushbu passport seriyasi bilan mijoz allaqachon mavjud."
        );
      }
    }
    const auth = new Auth({});
    await auth.save();

    const customerFiles: any = {};
    if (files) {
      if (files.passport && files.passport[0]) {
        customerFiles.passport = files.passport[0].path;
      }
      if (files.shartnoma && files.shartnoma[0]) {
        customerFiles.shartnoma = files.shartnoma[0].path;
      }
      if (files.photo && files.photo[0]) {
        customerFiles.photo = files.photo[0].path;
      }
    }

    const customer = new Customer({
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      address: data.address,
      passportSeries: data.passportSeries,
      birthDate: data.birthDate,
      auth,
      isActive: false,
      createBy,
      files: customerFiles,
    });
    await customer.save();
    return { message: "Mijoz yaratildi.", customer };
  }
}

export default new CustomerService();
