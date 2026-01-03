import { Request, Response } from "express";
import Contract from "../../schemas/contract.schema";
import logger from "../../utils/logger";

export const updatePaymentDate = async (req: Request, res: Response) => {
    try {
        const { contractId, newPaymentDate } = req.body;

        if (!contractId || !newPaymentDate) {
            return res.status(400).json({
                success: false,
                message: "Contract ID va yangi to'lov sanasi talab qilinadi",
            });
        }

        const contract = await Contract.findOne({ 
            _id: contractId, 
            isDeleted: false,
            isActive: true 
        });

        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Shartnoma topilmadi",
            });
        }

        if (contract.nextPaymentDate) {
            contract.previousPaymentDate = contract.nextPaymentDate;
        }

        contract.nextPaymentDate = new Date(newPaymentDate);

        await contract.save();

        return res.status(200).json({
            success: true,
            message: "To'lov sanasi muvaffaqiyatli o'zgartirildi",
            contract,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server xatosi",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
