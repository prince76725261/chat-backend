const { isProd } = require("../config/env");

const notFound = (req, _res, next) => {
  const err = new Error(`Not Found - ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message;
  let details = err.details;

  // Translate driver/ODM errors into something the client can act on.
  if (err.name === "ValidationError") {
    status = 400;
    details = Object.values(err.errors).map((e) => e.message);
    message = "Validation failed";
  } else if (err.name === "CastError") {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue).join(", ")} already in use`;
  }

  if (status >= 500) console.error("[error]", err);

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(isProd ? {} : { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
