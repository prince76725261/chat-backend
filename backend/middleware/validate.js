const ApiError = require("../utils/ApiError");

/** Runs a Zod schema over req.body and replaces it with the parsed result. */
const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(
      ApiError.badRequest(
        "Validation failed",
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      )
    );
  }
  req.body = result.data;
  next();
};

module.exports = { validate };
