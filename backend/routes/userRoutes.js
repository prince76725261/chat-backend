const express = require("express");
const { searchUsers, getUser, updateProfile } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { updateProfileSchema } = require("../validators/schemas");

const router = express.Router();
router.use(protect);

router.get("/", searchUsers);
router.put("/me", validate(updateProfileSchema), updateProfile);
router.get("/:userId", getUser);

module.exports = router;
