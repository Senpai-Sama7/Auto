import { randomUUID } from "node:crypto";
import { TextEncoder } from "node:util";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential
} from "@simplewebauthn/server";
import type {
  PasskeyChallengeRecord,
  PasskeyCredentialRecord,
  PasskeyCredentialSummary,
  UserRecord
} from "@ultimate-system/contracts";
import { nowIso } from "@ultimate-system/core";
import type { SqlitePlatformStore } from "@ultimate-system/sqlite-store";

const PASSKEY_CHALLENGE_TTL_MS = 1000 * 60 * 5;
const textEncoder = new TextEncoder();

export type PasskeyConfig = {
  rpName: string;
  rpId: string;
  expectedOrigins: string[];
  expectedRpIds: string[];
};

type StoredChallengeContext = {
  label?: string;
  email?: string;
  webauthnUserId?: string;
};

function expiresAtFrom(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

function toAuthenticatorTransports(transports: string[]): AuthenticatorTransportFuture[] {
  return transports.filter((transport): transport is AuthenticatorTransportFuture =>
    ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"].includes(transport)
  );
}

function toWebAuthnCredential(credential: PasskeyCredentialRecord): WebAuthnCredential {
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey, "base64url"),
    counter: credential.counter,
    transports: toAuthenticatorTransports(credential.transports)
  };
}

export function toPasskeySummary(summary: PasskeyCredentialRecord): PasskeyCredentialSummary {
  return {
    id: summary.id,
    userId: summary.userId,
    deviceType: summary.deviceType,
    backedUp: summary.backedUp,
    transports: summary.transports,
    label: summary.label,
    createdAt: summary.createdAt,
    lastUsedAt: summary.lastUsedAt
  };
}

async function createChallenge(
  store: SqlitePlatformStore,
  record: Omit<PasskeyChallengeRecord, "id" | "createdAt" | "expiresAt">
): Promise<PasskeyChallengeRecord> {
  const challengeRecord: PasskeyChallengeRecord = {
    id: randomUUID(),
    createdAt: nowIso(),
    expiresAt: expiresAtFrom(PASSKEY_CHALLENGE_TTL_MS),
    ...record
  };
  await store.createPasskeyChallenge(challengeRecord);
  return challengeRecord;
}

export async function beginPasskeyRegistration(
  store: SqlitePlatformStore,
  user: UserRecord,
  config: PasskeyConfig,
  label?: string
): Promise<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const existing = await store.listPasskeyCredentialsByUser(user.id);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: user.email,
    userDisplayName: user.name,
    userID: textEncoder.encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((credential) => ({
      id: credential.id,
      transports: toAuthenticatorTransports(credential.transports)
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required"
    }
  });

  const challenge = await createChallenge(store, {
    userId: user.id,
    flowType: "registration",
    challenge: options.challenge,
    context: {
      label,
      webauthnUserId: options.user.id
    }
  });

  return {
    flowId: challenge.id,
    options
  };
}

export async function finishPasskeyRegistration(
  store: SqlitePlatformStore,
  user: UserRecord,
  config: PasskeyConfig,
  flowId: string,
  response: RegistrationResponseJSON
): Promise<PasskeyCredentialSummary> {
  const challenge = await store.consumePasskeyChallenge(flowId, "registration");
  if (!challenge || challenge.userId !== user.id) {
    throw new Error("Passkey registration session expired. Start registration again.");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.expectedOrigins,
    expectedRPID: config.expectedRpIds,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration could not be verified.");
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
  const context = challenge.context as StoredChallengeContext;
  const createdAt = nowIso();
  await store.savePasskeyCredential({
    id: credential.id,
    userId: user.id,
    webauthnUserId: context.webauthnUserId ?? user.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports ?? [],
    label: context.label?.trim() || null,
    createdAt,
    lastUsedAt: createdAt
  });

  const saved = await store.getPasskeyCredential(credential.id);
  if (!saved) {
    throw new Error("Passkey registration completed but the credential was not persisted.");
  }

  return toPasskeySummary(saved);
}

export async function beginPasskeyAuthentication(
  store: SqlitePlatformStore,
  config: PasskeyConfig,
  email?: string
): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const normalizedEmail = email?.trim().toLowerCase() || undefined;
  const user = normalizedEmail ? await store.getUserByEmail(normalizedEmail) : null;
  const credentials = user ? await store.listPasskeyCredentialsByUser(user.id) : [];

  if (normalizedEmail && credentials.length === 0) {
    throw new Error("No passkeys are registered for that account.");
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: credentials.length > 0
      ? credentials.map((credential) => ({
          id: credential.id,
          transports: toAuthenticatorTransports(credential.transports)
        }))
      : undefined,
    userVerification: "required"
  });

  const challenge = await createChallenge(store, {
    userId: user?.id ?? null,
    flowType: "authentication",
    challenge: options.challenge,
    context: normalizedEmail ? { email: normalizedEmail } : {}
  });

  return {
    flowId: challenge.id,
    options
  };
}

export async function finishPasskeyAuthentication(
  store: SqlitePlatformStore,
  config: PasskeyConfig,
  flowId: string,
  response: AuthenticationResponseJSON
): Promise<{ user: UserRecord; credential: PasskeyCredentialSummary }> {
  const challenge = await store.consumePasskeyChallenge(flowId, "authentication");
  if (!challenge) {
    throw new Error("Passkey sign-in session expired. Start sign-in again.");
  }

  const credential = await store.getPasskeyCredential(response.id);
  if (!credential) {
    throw new Error("This passkey is not registered in the workspace.");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.expectedOrigins,
    expectedRPID: config.expectedRpIds,
    credential: toWebAuthnCredential(credential),
    requireUserVerification: true
  });

  if (!verification.verified) {
    throw new Error("Passkey sign-in could not be verified.");
  }

  const authenticatedUser = await store.getUserById(credential.userId);
  if (!authenticatedUser) {
    throw new Error("The account for this passkey no longer exists.");
  }

  await store.updatePasskeyCredentialUsage(credential.id, {
    counter: verification.authenticationInfo.newCounter,
    deviceType: verification.authenticationInfo.credentialDeviceType,
    backedUp: verification.authenticationInfo.credentialBackedUp,
    lastUsedAt: nowIso()
  });

  const updated = await store.getPasskeyCredential(credential.id);
  if (!updated) {
    throw new Error("Passkey authentication completed but the credential record is unavailable.");
  }

  return {
    user: authenticatedUser,
    credential: toPasskeySummary(updated)
  };
}
