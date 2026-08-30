const mongoose = require("mongoose");
const { mongoUri } = require("./env");

/**
 * Single shared connection pool for the whole process. Mongoose buffers
 * queries until the handshake completes, so callers never race the connect.
 */
const connectDB = async () => {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () =>
    console.warn("[mongo] disconnected")
  );
  mongoose.connection.on("reconnected", () =>
    console.info("[mongo] reconnected")
  );

  const conn = await mongoose.connect(mongoUri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  console.log(`[mongo] connected -> ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

module.exports = connectDB;
