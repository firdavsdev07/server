import { Request, Response, NextFunction } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import BaseError from "../../utils/base.error";
import customerService from "../services/customer.service";
import {
  CreateCustomerDto,
  SellerCreateCustomerDto,
  UpdateCustomerDto,
  UpdateManagerDto,
} from "../../validators/customer";
class CustomerController {
  async getAllCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerService.getAllCustomer();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerService.getAll();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getNewAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerService.getAllNew();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getCustomerById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await customerService.getCustomerById(id);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async checkPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone } = req.query;
      const phoneStr = Array.isArray(phone) ? phone[0] : phone;
      if (typeof phoneStr !== "string") {
        return next(BaseError.BadRequest("Telefon raqami noto'g'ri."));
      }
      const data = await customerService.checkPhone(phoneStr);
      res.status(200).json({ ...data });
    } catch (error) {
      return next(error);
    }
  }

  async checkPassport(req: Request, res: Response, next: NextFunction) {
    try {
      const { passport } = req.query;
      const passportStr = Array.isArray(passport) ? passport[0] : passport;
      if (typeof passportStr !== "string") {
        return next(BaseError.BadRequest("Pasport raqami noto'g'ri."));
      }
      const data = await customerService.checkPassport(passportStr);
      res.status(200).json({ ...data });
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const customerData = plainToInstance(CreateCustomerDto, req.body || {});
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Mijoz ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.create(customerData, user, req.files);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const customerData = plainToInstance(UpdateCustomerDto, req.body || {});
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Mijoz malumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.update(customerData, req.files, user); // ✅ User'ni pass qilish
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await customerService.delete(id);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }

  async restoration(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await customerService.restoration(id);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }

  async updateManager(req: Request, res: Response, next: NextFunction) {
    try {
      const resData = plainToInstance(UpdateManagerDto, req.body || {});
      const errors = await validate(resData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.updateManager(resData);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async confirmationCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const resData = plainToInstance(UpdateManagerDto, req.body || {});
      const errors = await validate(resData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.confirmationCustomer(resData);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  // seller

  async sellerCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const customerData = plainToInstance(
        SellerCreateCustomerDto,
        req.body || {}
      );
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Mijoz ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.sellerCreate(
        customerData,
        user,
        req.files
      );
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }
}

export default new CustomerController();
