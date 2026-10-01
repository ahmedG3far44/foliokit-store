import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import env from "../config/env.ts";
import UserModel, { type UserDocument } from "../models/user.ts";
import { AppError } from "../utils/app-error.ts";
import { sendEmailTemplate } from "./email.service.ts";

const googleClient = new OAuth2Client();

function invalidCredentials(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect");
}

async function queueWelcomeEmail(user: UserDocument & { _id: unknown }): Promise<void> {
  const retryBefore = new Date(Date.now() - 10 * 60_000);
  const welcomeRecipient = await UserModel.findOneAndUpdate(
    { _id: user._id, $or: [
      { welcomeEmailState: { $in: ["pending", "failed"] } },
      { welcomeEmailState: "sending", welcomeEmailAttemptedAt: { $lt: retryBefore } },
    ] },
    { $set: { welcomeEmailState: "sending", welcomeEmailAttemptedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!welcomeRecipient) return;
  try {
    await sendEmailTemplate({
      to: welcomeRecipient.email,
      type: "welcome",
      variables: { name: welcomeRecipient.name },
      idempotencyKey: `welcome-user/${String(welcomeRecipient._id)}`,
    });
    await UserModel.updateOne({ _id: welcomeRecipient._id }, { $set: { welcomeEmailState: "sent", welcomeEmailSentAt: new Date() } });
  } catch (error) {
    console.error("Welcome email delivery failed", { userId: String(welcomeRecipient._id), error });
    await UserModel.updateOne({ _id: welcomeRecipient._id }, { $set: { welcomeEmailState: "failed" } });
  }
}

function normalizeLegacyRole(user: UserDocument): void {
  if (user.role === "user") user.role = "customer";
}

export async function registerWithPassword(input: { name: string; email: string; password: string }) {
  if (await UserModel.exists({ email: input.email })) {
    throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account already exists for this email");
  }
  const user = await UserModel.create({
    email: input.email,
    name: input.name,
    passwordHash: await bcrypt.hash(input.password, 12),
    provider: "email",
    emailVerified: false,
    role: "customer",
    status: "active",
    joinedAt: new Date(),
    lastLoginAt: new Date(),
    welcomeEmailState: "pending",
  });
  void queueWelcomeEmail(user).catch((error) => console.error("Unable to queue welcome email", { userId: String(user._id), error }));
  return user;
}

export async function loginWithPassword(input: { email: string; password: string }) {
  const user = await UserModel.findOne({ email: input.email }).select("+passwordHash");
  if (!user?.passwordHash || !await bcrypt.compare(input.password, user.passwordHash)) throw invalidCredentials();
  if (user.status === "blocked") throw new AppError(403, "ACCOUNT_BLOCKED", "Your account has been blocked. Contact support.");
  normalizeLegacyRole(user);
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function loginWithGoogle(credential: string) {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, "GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured");
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(401, "INVALID_GOOGLE_CREDENTIAL", "Google could not verify this sign-in");
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(401, "INVALID_GOOGLE_CREDENTIAL", "Google did not provide a verified email address");
  }
  const email = payload.email.trim().toLowerCase();
  let user = await UserModel.findOne({ $or: [{ googleId: payload.sub }, { email }] }).select("+googleId");
  const isNew = !user;
  if (!user) {
    user = new UserModel({
      googleId: payload.sub,
      email,
      name: payload.name?.trim() || email.split("@")[0] || "User",
      avatarUrl: payload.picture,
      provider: "google",
      emailVerified: true,
      role: "customer",
      status: "active",
      joinedAt: new Date(),
      welcomeEmailState: "pending",
    });
  } else if (user.googleId && user.googleId !== payload.sub) {
    throw new AppError(409, "GOOGLE_ACCOUNT_CONFLICT", "This email is linked to a different Google account");
  } else {
    user.googleId = payload.sub;
    user.emailVerified = true;
    user.avatarUrl = payload.picture ?? user.avatarUrl;
    if (!user.name) user.name = payload.name?.trim() || email.split("@")[0] || "User";
  }
  if (user.status === "blocked") throw new AppError(403, "ACCOUNT_BLOCKED", "Your account has been blocked. Contact support.");
  normalizeLegacyRole(user);
  user.lastLoginAt = new Date();
  await user.save();
  if (isNew) void queueWelcomeEmail(user).catch((error) => console.error("Unable to queue welcome email", { userId: String(user._id), error }));
  return user;
}
