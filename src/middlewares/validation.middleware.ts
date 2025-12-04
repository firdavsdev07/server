import { Request, Response, NextFunction } from "express";
import { plainToInstance, ClassConstructor } from "class-transformer";
import { validate, ValidationError } from "class-validator";
import { handleValidationErrors } from "../validators/format";
import BaseError from "../utils/base.error";

/**
 * Generic validation middleware factory
 * Requirements: 9.1, 9.2, 9.3
 *
 * @param dtoClass - DTO class to validate against
 * @param source - Where to get data from ('body', 'params', 'query')
 * @returns Express middleware function
 */
export function validateDto<T extends object>(
  dtoClass: ClassConstructor<T>,
  source: "body" | "params" | "query" = "body"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const dtoInstance = plainToInstance(dtoClass, data || {});
      const errors: ValidationError[] = await validate(dtoInstance);

      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest(
            "Ma'lumotlar validatsiyadan o'tmadi",
            formattedErrors
          )
        );
      }

      // Attach validated data to request for use in controller
      req.validatedData = dtoInstance;
      next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Contract edit validation middleware
 * Requirements: 9.1, 9.2, 9.3
 *
 * Validates contract edit requests with additional business logic checks
 */
export async function validateContractEditRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { monthlyPayment, initialPayment, totalPrice } = req.body;

    // Basic type validation
    if (monthlyPayment !== undefined) {
      if (typeof monthlyPayment !== "number" || monthlyPayment < 0) {
        return next(
          BaseError.BadRequest("Oylik to'lov musbat raqam bo'lishi kerak")
        );
      }
    }

    if (initialPayment !== undefined) {
      if (typeof initialPayment !== "number" || initialPayment < 0) {
        return next(
          BaseError.BadRequest(
            "Boshlang'ich to'lov musbat raqam bo'lishi kerak"
          )
        );
      }
    }

    if (totalPrice !== undefined) {
      if (typeof totalPrice !== "number" || totalPrice < 0) {
        return next(
          BaseError.BadRequest("Umumiy narx musbat raqam bo'lishi kerak")
        );
      }
    }

    // Validate totalPrice > initialPayment if both are provided
    if (totalPrice !== undefined && initialPayment !== undefined) {
      if (totalPrice <= initialPayment) {
        return next(
          BaseError.BadRequest(
            "Umumiy narx boshlang'ich to'lovdan katta bo'lishi kerak"
          )
        );
      }
    }

    next();
  } catch (error) {
    return next(error);
  }
}

// Extend Express Request type to include validatedData
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
    }
  }
}
