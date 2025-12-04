import mongoose from "mongoose";
import logger from "../utils/logger";

const connectDB = async () => {
  const MONGO_DB = process.env.MONGO_DB;

  if (!MONGO_DB) {
    throw new Error("MONGO_DB environment variable is not set");
  }
  try {
    await mongoose.connect(MONGO_DB);
    logger.debug("MongoDB connected");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
