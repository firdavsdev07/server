import { Schema, model } from "mongoose";

// Auto-increment counter uchun schema
export interface ICounter {
    name: string;      // "customer" yoki "payment"
    value: number;     // Hozirgi qiymat
}

const CounterSchema = new Schema<ICounter>({
    name: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 },
});

const Counter = model<ICounter>("Counter", CounterSchema);

export default Counter;
