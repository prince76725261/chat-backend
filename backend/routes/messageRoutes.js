const express = require("express");
const {
  getMessages,
  sendMessage,
  markChatRead,
  deleteMessage,
} = require("../controllers/messageController");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { sendMessageSchema } = require("../validators/schemas");

const router = express.Router();
router.use(protect);

router.post("/", validate(sendMessageSchema), sendMessage);
router.get("/:chatId", getMessages);
router.put("/:chatId/read", markChatRead);
router.delete("/:messageId", deleteMessage);

module.exports = router;
