/**
 * Shared types and interfaces for Contract Service modules
 */

import { Types } from "mongoose";
import { IEmployee } from "../../../schemas/employee.schema";

/**
 * Contract change record for edit history
 */
export interface ContractChange {
  field: string;
  oldValue: any;
  newValue: any;
  difference: number;
}

/**
 * Impact summary after contract edit
 */
export interface ImpactSummary {
  underpaidCount: number;
  overpaidCount: number;
  totalShortage: number;
  totalExcess: number;
  additionalPaymentsCreated: number;
}

/**
 * Edit history entry
 */
export interface ContractEditEntry {
  date: Date;
  editedBy: Types.ObjectId;
  changes: ContractChange[];
  affectedPayments: Types.ObjectId[];
  impactSummary: ImpactSummary;
}

/**
 * Balance update data
 */
export interface BalanceUpdate {
  dollar?: number;
  sum?: number;
}

/**
 * Contract creation result
 */
export interface ContractCreationResult {
  message: string;
  contractId: Types.ObjectId;
}

/**
 * Contract update result
 */
export interface ContractUpdateResult {
  status: string;
  message: string;
  contractId: Types.ObjectId;
  changes: ContractChange[];
  impactSummary: ImpactSummary;
}
