import { z } from "zod";
import {
  ApprovalStateSchema,
  ExecutionModeSchema,
  GateEvidenceSchema,
  GateStatusSchema,
  PasskeyCredentialSummarySchema,
  UserRoleSchema
} from "./domain.js";

export const CreateTaskInputSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  requestedBy: z.string().min(2),
  orgId: z.string().default("org-core"),
  teamId: z.string().default("team-platform"),
  skillHint: z.string().optional(),
  budgetCapUsd: z.number().positive().max(5000).default(15),
  executionMode: ExecutionModeSchema.default("deterministic"),
  requiredCapabilities: z.array(z.string().min(1)).default(["planning"]),
  idempotencyKey: z.string().min(3).max(128).optional(),
  maxRetries: z.number().int().min(0).max(5).default(1)
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const GateTransitionInputSchema = z.object({
  status: GateStatusSchema,
  evidence: GateEvidenceSchema
});
export type GateTransitionInput = z.infer<typeof GateTransitionInputSchema>;

export const ApprovalTransitionInputSchema = z.object({
  approvalState: ApprovalStateSchema,
  actor: z.string().min(2).optional(),
  reason: z.string().min(3)
});
export type ApprovalTransitionInput = z.infer<typeof ApprovalTransitionInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const PasskeyRegistrationOptionsInputSchema = z.object({
  label: z.string().trim().min(1).max(64).optional()
});
export type PasskeyRegistrationOptionsInput = z.infer<typeof PasskeyRegistrationOptionsInputSchema>;

export const PasskeyAuthenticationOptionsInputSchema = z.object({
  email: z.string().email().optional()
});
export type PasskeyAuthenticationOptionsInput = z.infer<typeof PasskeyAuthenticationOptionsInputSchema>;

export const PasskeyVerificationInputSchema = z.object({
  flowId: z.string().min(1),
  response: z.unknown()
});
export type PasskeyVerificationInput = z.infer<typeof PasskeyVerificationInputSchema>;

export const PasskeyRegistrationStartResponseSchema = z.object({
  flowId: z.string(),
  options: z.unknown()
});
export type PasskeyRegistrationStartResponse = z.infer<typeof PasskeyRegistrationStartResponseSchema>;

export const PasskeyAuthenticationStartResponseSchema = z.object({
  flowId: z.string(),
  options: z.unknown()
});
export type PasskeyAuthenticationStartResponse = z.infer<typeof PasskeyAuthenticationStartResponseSchema>;

export const PasskeyListResponseSchema = z.object({
  credentials: z.array(PasskeyCredentialSummarySchema),
  recommended: z.boolean()
});
export type PasskeyListResponse = z.infer<typeof PasskeyListResponseSchema>;

export const UpsertUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: UserRoleSchema
});
export type UpsertUserInput = z.infer<typeof UpsertUserInputSchema>;
