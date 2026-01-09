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
import { generateCustomerId } from "../../utils/id-generator";

class CustomerService {
  async getAllCustomer() {
    // ✅ TUZATISH: Eng eski shartnoma sanasini olish
    return await Customer.aggregate([
      {
        $match: {
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
          pipeline: [
            {
              $match: {
                isDeleted: false,
              },
            },
            {
              $project: {
                _id: 1,
                originalPaymentDay: 1,  // ✅ originalPaymentDay ni qo'shish
                createdAt: 1,
              },
            },
            {
              $sort: { createdAt: -1 }, // ✅ TUZATISH: Eng YANGI shartnoma birinchi (oxirgi yaratilgan)
            },
          ],
        },
      },
      {
        $addFields: {
          // Eng YANGI (oxirgi) shartnomaning createdAt sanasini olish
          latestContractDate: {
            $ifNull: [
              { $arrayElemAt: ["$contracts.createdAt", 0] },
              "$createdAt",
            ],
          },
        },
      },
      {
        $project: {
          customerId: 1,
          fullName: 1,
          phoneNumber: 1,
          address: 1,
          passportSeries: 1,
          birthDate: 1,
          telegramName: 1,
          telegramId: 1,
          auth: 1,
          files: 1,
          editHistory: 1,
          isActive: 1,
          isDeleted: 1,
          deletedAt: 1,
          createBy: 1,
          createdAt: "$latestContractDate", // ✅ Eng YANGI (oxirgi) shartnoma sanasini qaytarish
          updatedAt: 1,
          contracts: 1,  // ✅ contracts arrayni qaytarish
          manager: {
            $cond: {
              if: { $ifNull: ["$manager._id", false] },
              then: {
                _id: "$manager._id",
                fullName: "$manager.fullName",
                isDeleted: "$manager.isDeleted",
              },
              else: null,
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
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
          pipeline: [
            {
              $match: {
                isDeleted: false,
                isActive: true,
              },
            },
            {
              $project: {
                _id: 1,
                originalPaymentDay: 1,  // ✅ originalPaymentDay ni qo'shish
                createdAt: 1,
              },
            },
            {
              $sort: { createdAt: -1 }, // ✅ TUZATISH: Eng YANGI shartnoma birinchi (oxirgi yaratilgan)
            },
          ],
        },
      },
      {
        $addFields: {
          contractCount: { $size: "$contracts" },
          // ✅ TUZATISH: Eng YANGI (oxirgi) shartnomaning createdAt sanasini olish
          latestContractDate: {
            $ifNull: [
              { $arrayElemAt: ["$contracts.createdAt", 0] },
              "$createdAt",
            ],
          },
        },
      },
      {
        $project: {
          customerId: 1,
          fullName: 1,
          phoneNumber: 1,
          address: 1,
          passportSeries: 1,
          birthDate: 1,
          createdAt: "$latestContractDate", // ✅ Eng YANGI (oxirgi) shartnoma sanasini qaytarish
          contracts: 1,  // ✅ contracts arrayni qaytarish
          manager: {
            $ifNull: [
              {
                _id: "$manager._id",
                fullName: "$manager.fullName",
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
    // ✅ TUZATISH: Yangi mijozlar uchun ham eng eski shartnoma sanasini olish
    return await Customer.aggregate([
      {
        $match: {
          isDeleted: false,
          isActive: false,
        },
      },
      {
        $lookup: {
          from: "contracts",
          localField: "_id",
          foreignField: "customer",
          as: "contracts",
          pipeline: [
            {
              $match: {
                isDeleted: false,
              },
            },
            {
              $project: {
                _id: 1,
                originalPaymentDay: 1,  // ✅ originalPaymentDay ni qo'shish
                createdAt: 1,
              },
            },
            {
              $sort: { createdAt: -1 }, // ✅ TUZATISH: Eng YANGI shartnoma birinchi (oxirgi yaratilgan)
            },
          ],
        },
      },
      {
        $addFields: {
          // Eng YANGI (oxirgi) shartnomaning createdAt sanasini olish
          latestContractDate: {
            $ifNull: [
              { $arrayElemAt: ["$contracts.createdAt", 0] },
              "$createdAt",
            ],
          },
        },
      },
      {
        $project: {
          customerId: 1,
          fullName: 1,
          phoneNumber: 1,
          address: 1,
          passportSeries: 1,
          birthDate: 1,
          telegramName: 1,
          telegramId: 1,
          auth: 1,
          manager: 1,
          files: 1,
          editHistory: 1,
          isActive: 1,
          isDeleted: 1,
          deletedAt: 1,
          createBy: 1,
          createdAt: "$latestContractDate", // ✅ Eng YANGI (oxirgi) shartnoma sanasini qaytarish
          updatedAt: 1,
          contracts: 1,  // ✅ contracts arrayni qaytarish (originalPaymentDay bilan)
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
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
        select: "fullName _id isDeleted",
      })
      .populate({
        path: "editHistory.editedBy",
        select: "fullName _id",
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
                paymentId: 1,
                amount: 1,
                actualAmount: 1, 
                date: 1,
                isPaid: 1,
                paymentType: 1,
                status: 1,
                remainingAmount: 1,
                excessAmount: 1,
                expectedAmount: 1,
                prepaidAmount: 1, // ✅ TUZATILDI: Oldindan to'langan summa
                notes: 1,
                confirmedAt: 1, // ✅ TUZATILDI: Tasdiqlangan vaqt
                confirmedBy: 1, // ✅ TUZATILDI: Kim tomonidan tasdiqlangan
                targetMonth: 1,
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
                    cond: { $eq: ["$$p.isPaid", true] },
                  },
                },
                as: "pp",
                in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          // 1. Basic price field safety
          safeInitial: { $ifNull: ["$initialPayment", 0] },
          safeMonthly: { $ifNull: ["$monthlyPayment", 0] },
          safeOriginal: { $ifNull: ["$originalPrice", { $ifNull: ["$price", 0] }] },
          safePrice: { $ifNull: ["$price", { $ifNull: ["$originalPrice", 0] }] },

          // 2. Period recovery (treat 0 as missing)
          rawPeriod: {
            $cond: [
              { $gt: [{ $ifNull: ["$period", { $ifNull: ["$duration", 0] }] }, 0] },
              { $ifNull: ["$period", "$duration"] },
              null
            ]
          },
          rawPercentage: { $ifNull: ["$percentage", { $ifNull: ["$percent", 0] }] },
        },
      },
      {
        $addFields: {
          // 3. Derived period if missing
          safePeriod: {
            $convert: {
              input: {
                $ifNull: [
                  "$rawPeriod",
                  {
                    $cond: [
                      {
                        $and: [
                          { $gt: ["$safeMonthly", 0] },
                          { $gt: ["$totalPrice", "$safeInitial"] },
                        ],
                      },
                      {
                        $ceil: {
                          $divide: [
                            { $subtract: ["$totalPrice", "$safeInitial"] },
                            "$safeMonthly",
                          ],
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
              to: "double",
              onNull: 0,
              onError: 0,
            },
          },
        },
      },
      {
        $addFields: {
          // 4. Final Total Price (if not present)
          safeTotal: {
            $ifNull: [
              "$totalPrice",
              { $add: ["$safeInitial", { $multiply: ["$safeMonthly", "$safePeriod"] }] },
            ],
          },
        },
      },
      {
        $addFields: {
          remainingDebt: { $subtract: ["$safeTotal", "$totalPaid"] },
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          originalPrice: { $convert: { input: "$safeOriginal", to: "double", onNull: 0, onError: 0 } },
          price: { $convert: { input: "$safePrice", to: "double", onNull: 0, onError: 0 } },
          totalPrice: "$safeTotal",
          initialPayment: "$safeInitial",
          initialPaymentDueDate: 1,
          monthlyPayment: "$safeMonthly",
          percentage: { $convert: { input: "$rawPercentage", to: "double", onNull: 0, onError: 0 } },
          period: "$safePeriod",
          duration: "$safePeriod",
          startDate: 1,
          endDate: 1,
          status: 1,
          notes: 1,
          payments: 1,
          totalPaid: 1,
          remainingDebt: 1,
          info: 1,
          nextPaymentDate: 1,
          previousPaymentDate: 1,
          prepaidBalance: 1,
          createdAt: 1,
          updatedAt: 1,
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

    // Yangi mijoz ID generatsiya qilish
    const customerId = await generateCustomerId();

    const customer = new Customer({
      customerId,
      fullName: data.fullName,
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
      data.fullName,
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

    if (data.fullName && data.fullName !== customer.fullName) {
      changes.push({
        field: "Mijoz ismi",
        oldValue: customer.fullName,
        newValue: data.fullName,
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
          ? `${oldManager.firstName || ""} ${oldManager.lastName || ""}`.trim()
          : customer.manager?.toString() || "—",
        newValue: newManager
          ? `${newManager.firstName || ""} ${newManager.lastName || ""}`.trim()
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
        customer.fullName,
        changes,
        user.sub
      );
    }

    await Customer.findOneAndUpdate(
      { _id: data.id, isDeleted: false },
      {
        fullName: data.fullName,
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

    // Yangi mijoz ID generatsiya qilish
    const customerId = await generateCustomerId();

    const customer = new Customer({
      customerId,
      fullName: data.fullName,
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
