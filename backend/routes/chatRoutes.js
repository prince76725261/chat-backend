const express = require("express");
const {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
} = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const {
  userIdSchema,
  createGroupSchema,
  renameGroupSchema,
  groupUserSchema,
} = require("../validators/schemas");

const router = express.Router();
router.use(protect);

router.get("/", fetchChats);
router.post("/", validate(userIdSchema), accessChat);
router.post("/group", validate(createGroupSchema), createGroupChat);
router.put("/group/rename", validate(renameGroupSchema), renameGroup);
router.put("/group/add", validate(groupUserSchema), addToGroup);
router.put("/group/remove", validate(groupUserSchema), removeFromGroup);

module.exports = router;
