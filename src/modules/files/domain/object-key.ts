import { randomUUID } from "node:crypto";

export const OBJECT_KEY_PATTERN =
  /^objects\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isObjectKey(value: string): boolean {
  return OBJECT_KEY_PATTERN.test(value);
}

export function generateObjectKey(): string {
  return `objects/${randomUUID()}`;
}
