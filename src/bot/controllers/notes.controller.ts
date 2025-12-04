import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import customerService from "../services/customer.service";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import notesService from "../services/notes.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import { NotesDto } from "../../validators/notes";
import logger from "../../utils/logger";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };

class NotesController {
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const id = req.params.id;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await notesService.getById(user, id);
      res.json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }

  async add(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const notesData = plainToInstance(NotesDto, req.body || {});
      const errors = await validate(notesData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Izoh ma'lumotlari xato.", formattedErrors)
        );
      }
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await notesService.add(user, notesData);
      res.json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }
}
export default new NotesController();
