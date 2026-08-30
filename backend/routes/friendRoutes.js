const express = require("express");
const {
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  listRequests,
  listFriends,
  removeFriend,
  blockUser,
  unblockUser,
} = require("../controllers/friendController");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { userIdSchema } = require("../validators/schemas");

const router = express.Router();
router.use(protect);

router.get("/", listFriends);
router.get("/requests", listRequests);
router.post("/request", validate(userIdSchema), sendRequest);
router.put("/request/:requestId/accept", acceptRequest);
router.put("/request/:requestId/reject", rejectRequest);
router.delete("/request/:requestId", cancelRequest);
router.post("/block", validate(userIdSchema), blockUser);
router.delete("/block/:userId", unblockUser);
router.delete("/:userId", removeFriend);

module.exports = router;
