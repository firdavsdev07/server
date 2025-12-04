import BaseError from "../../utils/base.error";
import Auth from "../../schemas/auth.schema";
import Customer from "../../schemas/customer.schema";
import Employee from "../../schemas/employee.schema";
import { CreateCustomerDtoForSeller } from "../validators/customer";
import IJwtUser from "../../types/user";
import { Types } from "mongoose";

class CustomerService {
  // Barcha yangi mijozlarni ko'rish
  async getAllNew(userId: string) {
    const query: any = {
      isDeleted: false,
      isActive: false,
    };
    const customers = await Customer.find(query).sort({ createdAt: -1 });
    return customers;
  }

  // Bitta mijozni ko'rish
  async getOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw BaseError.BadRequest("Noto'g'ri mijoz ID.");
    }

    const customer = await Customer.findById(id)
      .populate("manager", "firstName lastName phoneNumber")
      .populate({
        path: "contracts",
        match: { isDeleted: false },
        options: { sort: { createdAt: -1 } },
        select:
          "productName price totalPrice monthlyPayment period status nextPaymentDate startDate isActive",
      });

    if (!customer) {
      throw BaseError.NotFoundError("Mijoz topilmadi.");
    }

    return customer;
  }

  // Mijozni yangilash (seller uchun - menejerni o'zgartira olmaydi)
  async update(id: string, data: CreateCustomerDtoForSeller, files?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw BaseError.BadRequest("Noto'g'ri mijoz ID.");
    }

    const customer = await Customer.findById(id);
    if (!customer) {
      throw BaseError.NotFoundError("Mijoz topilmadi.");
    }

    // Telefon raqamini tekshirish (o'zgargan bo'lsa)
    if (data.phoneNumber && data.phoneNumber !== customer.phoneNumber) {
      const existingPhone = await Customer.findOne({
        phoneNumber: data.phoneNumber,
        _id: { $ne: id },
      });
      if (existingPhone) {
        throw BaseError.BadRequest(
          "Ushbu telefon raqami bilan mijoz allaqachon mavjud."
        );
      }
    }

    // Passport seriyasini tekshirish (o'zgargan bo'lsa)
    if (
      data.passportSeries &&
      data.passportSeries !== customer.passportSeries
    ) {
      const existingSeries = await Customer.findOne({
        passportSeries: data.passportSeries,
        _id: { $ne: id },
      });
      if (existingSeries) {
        throw BaseError.BadRequest(
          "Ushbu passport seriyasi bilan mijoz allaqachon mavjud."
        );
      }
    }

    // File paths
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

    // Mijoz ma'lumotlarini yangilash (menejerni o'zgartirmasdan)
    customer.firstName = data.firstName;
    customer.lastName = data.lastName;
    customer.phoneNumber = data.phoneNumber;
    customer.address = data.address;
    customer.passportSeries = data.passportSeries;
    customer.birthDate = data.birthDate;
    customer.files = customerFiles;

    await customer.save();

    return { message: "Mijoz ma'lumotlari yangilandi.", customer };
  }

  async create(data: CreateCustomerDtoForSeller, user: IJwtUser, files?: any) {
    const createBy = await Employee.findById(user.sub);
    if (!createBy) {
      throw BaseError.ForbiddenError();
    }

    if (data.phoneNumber) {
      const customerNumber = await Customer.findOne({
        phoneNumber: data.phoneNumber,
      });
      if (customerNumber) {
        throw BaseError.BadRequest(
          "Ushbu telefon raqami bilan mijoz allaqachon mavjud."
        );
      }
    }

    if (data.passportSeries) {
      const customerSeries = await Customer.findOne({
        passportSeries: data.passportSeries,
      });
      if (customerSeries) {
        throw BaseError.BadRequest(
          "Ushbu passport seriyasi bilan mijoz allaqachon mavjud."
        );
      }
    }

    const auth = new Auth({});
    await auth.save();

    // File paths
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
