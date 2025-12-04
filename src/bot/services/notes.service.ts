import IJwtUser from "../../types/user";
import BaseError from "../../utils/base.error";
import { Types } from "mongoose";
import Notes from "../../schemas/notes.schema";
import { NotesDto } from "../../validators/notes";
import Employee from "../../schemas/employee.schema";
import Customer from "../../schemas/customer.schema";

class CustomerService {
  async getById(user: IJwtUser, customerId: string) {
    try {
      const notes = await Notes.aggregate([
        {
          $match: {
            customer: new Types.ObjectId(customerId),
          },
        },
        {
          $lookup: {
            from: "employees",
            localField: "createBy",
            foreignField: "_id",
            as: "employeeDetail",
          },
        },
        {
          $unwind: {
            path: "$employeeDetail",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            fullName: {
              $concat: [
                "$employeeDetail.firstName",
                " ",
                "$employeeDetail.lastName",
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            text: 1,
            fullName: 1,
            createdAt: 1,
            createBy: 1,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
      ]);

      if (!notes.length) {
        throw BaseError.NotFoundError("Izoh topilmadi.");
      }

      return {
        status: "success",
        data: notes,
      };
    } catch (error) {
      throw BaseError.InternalServerError(String(error));
    }
  }

  async add(user: IJwtUser, notesData: NotesDto) {
    try {
      const manager = await Employee.findById(user.sub);
      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi yoki o'chirilgan");
      }

      const customer = await Customer.findById(notesData.customerId);

      if (!customer) {
        throw BaseError.NotFoundError("Mijoz topilmadi yoki o'chirilgan");
      }

      const notes = new Notes({
        text: notesData.notes,
        customer,
        createBy: manager,
      });
      await notes.save();

      return {
        status: "success",
        message: "Izoh qo'shildi.",
      };
    } catch (error) {
      throw BaseError.InternalServerError(String(error));
    }
  }
}

export default new CustomerService();
