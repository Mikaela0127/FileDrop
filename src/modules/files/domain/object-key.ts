import { randomUUID } from "node:crypto";

export function generateObjectKey(): string {
  return `objects/${randomUUID()}`;
}
