import { z } from "zod";

import { isOwnerPasswordHash } from "../security/owner-password-hash-format";

const optionalString = <Schema extends z.ZodType<string>>(schema: Schema) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

function usesProtocol(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const appUrlSchema = z
  .url("APP_URL must be a valid URL")
  .refine(
    (value) => usesProtocol(value, ["http:", "https:"]),
    "APP_URL must use http or https",
  );

const databaseUrlSchema = (variableName: "DATABASE_URL" | "DIRECT_URL") =>
  z
    .url(`${variableName} must be a valid URL`)
    .refine(
      (value) => usesProtocol(value, ["postgres:", "postgresql:"]),
      `${variableName} must use the postgres or postgresql protocol`,
    );

const r2AccountIdSchema = z
  .string()
  .regex(
    /^[a-f0-9]{32}$/iu,
    "R2_ACCOUNT_ID must contain exactly 32 hexadecimal characters",
  );

const r2BucketNameSchema = z
  .string()
  .min(3, "R2_BUCKET_NAME must contain at least 3 characters")
  .max(63, "R2_BUCKET_NAME must contain at most 63 characters")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u,
    "R2_BUCKET_NAME may contain lowercase letters, numbers, and internal hyphens only",
  );

export const serverEnvSchema = z
  .object({
    APP_URL: appUrlSchema,
    DATABASE_URL: databaseUrlSchema("DATABASE_URL"),
    DIRECT_URL: optionalString(databaseUrlSchema("DIRECT_URL")),
    SESSION_SECRET: optionalString(
      z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
    ),
    UPLOAD_PASSWORD_HASH: optionalString(
      z
        .string()
        .refine(
          isOwnerPasswordHash,
          "UPLOAD_PASSWORD_HASH must be a FileDrop scrypt hash",
        ),
    ),
    CRON_SECRET: optionalString(
      z.string().min(32, "CRON_SECRET must contain at least 32 characters"),
    ),
    R2_ACCOUNT_ID: optionalString(r2AccountIdSchema),
    R2_ACCESS_KEY_ID: optionalString(z.string().min(1)),
    R2_SECRET_ACCESS_KEY: optionalString(z.string().min(1)),
    R2_BUCKET_NAME: optionalString(r2BucketNameSchema),
  })
  .superRefine((environment, context) => {
    const authKeys = ["SESSION_SECRET", "UPLOAD_PASSWORD_HASH"] as const;
    const configuredAuthKeys = authKeys.filter((key) => environment[key]);

    if (
      configuredAuthKeys.length > 0 &&
      configuredAuthKeys.length < authKeys.length
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Owner authentication must provide SESSION_SECRET and UPLOAD_PASSWORD_HASH together",
        path: ["SESSION_SECRET"],
      });
    }

    const r2Keys = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ] as const;
    const configuredR2Keys = r2Keys.filter((key) => environment[key]);

    if (
      configuredR2Keys.length > 0 &&
      configuredR2Keys.length < r2Keys.length
    ) {
      context.addIssue({
        code: "custom",
        message: "R2 configuration must provide all four R2 variables together",
        path: ["R2_ACCOUNT_ID"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  environment: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
