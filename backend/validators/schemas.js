const { z } = require("zod");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_.]+$/, "letters, numbers, _ and . only"),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, "at least 8 characters")
    .max(72)
    .regex(/[a-zA-Z]/, "must contain a letter")
    .regex(/[0-9]/, "must contain a number"),
  avatar: z.string().url().optional().or(z.literal("")),
});

const loginSchema = z.object({
  // Accept either the email or the username in one field.
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  about: z.string().trim().max(140).optional(),
  avatar: z.string().url().optional().or(z.literal("")),
});

const sendMessageSchema = z.object({
  chatId: objectId,
  content: z.string().trim().min(1).max(4000),
  type: z.enum(["text", "image"]).default("text"),
  replyTo: objectId.nullable().optional(),
  clientId: z.string().max(64).optional(),
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  users: z.array(objectId).min(2, "a group needs at least 3 people including you"),
});

const chatIdSchema = z.object({ chatId: objectId });
const userIdSchema = z.object({ userId: objectId });
const groupUserSchema = z.object({ chatId: objectId, userId: objectId });
const renameGroupSchema = z.object({ chatId: objectId, name: z.string().trim().min(1).max(60) });
const requestIdSchema = z.object({ requestId: objectId });

module.exports = {
  objectId,
  registerSchema,
  loginSchema,
  updateProfileSchema,
  sendMessageSchema,
  createGroupSchema,
  chatIdSchema,
  userIdSchema,
  groupUserSchema,
  renameGroupSchema,
  requestIdSchema,
};
