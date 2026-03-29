import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";
import type { AuthMethod, SessionRecord, UserRecord } from "@ultimate-system/contracts";
import { nowIso } from "@ultimate-system/core";
import type { SqlitePlatformStore } from "@ultimate-system/sqlite-store";

const SESSION_COOKIE = "ultimate_system_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export type BootstrapIdentity = {
  email: string;
  name: string;
  password: string;
  role: UserRecord["role"];
};

export type AuthenticatedRequest = Request & {
  currentUser?: UserRecord | null;
  currentSessionId?: string | null;
  currentAuthMethod?: AuthMethod | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, digest] = passwordHash.split(":");
  if (!salt || !digest) {
    return false;
  }
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function seedLocalIdentity(
  store: SqlitePlatformStore,
  identity: BootstrapIdentity
): Promise<void> {
  const timestamp = nowIso();
  await store.upsertUser({
    id: randomUUID(),
    email: identity.email,
    name: identity.name,
    passwordHash: hashPassword(identity.password),
    role: identity.role,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function seedLocalIdentities(
  store: SqlitePlatformStore,
  identities: BootstrapIdentity[]
): Promise<void> {
  for (const identity of identities) {
    await seedLocalIdentity(store, identity);
  }
}

export async function attachSession(store: SqlitePlatformStore, request: AuthenticatedRequest): Promise<void> {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    request.currentUser = null;
    request.currentSessionId = null;
    request.currentAuthMethod = null;
    return;
  }

  const token = parse(cookieHeader)[SESSION_COOKIE];
  if (!token) {
    request.currentUser = null;
    request.currentSessionId = null;
    request.currentAuthMethod = null;
    return;
  }

  const session = await store.getSessionByTokenHash(sha256(token));
  if (!session) {
    request.currentUser = null;
    request.currentSessionId = null;
    request.currentAuthMethod = null;
    return;
  }

  request.currentUser = await store.getUserById(session.userId);
  request.currentSessionId = session.id;
  request.currentAuthMethod = session.authMethod;
}

export async function createAuthSession(
  store: SqlitePlatformStore,
  user: UserRecord,
  authMethod: AuthMethod = "password"
): Promise<{ token: string; session: SessionRecord }> {
  const token = randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const session: SessionRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: sha256(token),
    authMethod,
    createdAt,
    expiresAt
  };
  await store.createAuthSession(session);
  await store.touchUserLogin(user.id, createdAt);
  return { token, session };
}

export function setSessionCookie(response: Response, token: string): void {
  response.setHeader("Set-Cookie", serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  }));
}

export function clearSessionCookie(response: Response): void {
  response.setHeader("Set-Cookie", serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  }));
}

export function requireUser(request: AuthenticatedRequest): UserRecord {
  if (!request.currentUser) {
    throw new Error("Unauthorized");
  }
  return request.currentUser;
}

export function requireApprover(request: AuthenticatedRequest): UserRecord {
  const user = requireUser(request);
  if (user.role !== "admin" && user.role !== "approver") {
    throw new Error("Forbidden");
  }
  return user;
}
