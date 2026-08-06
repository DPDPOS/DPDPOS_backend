import { ConflictError } from "../../../shared/errors/app-error.js";
import type { EvidenceStatus } from "@prisma/client";

const validTransitions: Record<string, string[]> = {
  UPLOADED: ["TAGGED", "MAPPED", "UNDER_REVIEW"],
  TAGGED: ["MAPPED"],
  MAPPED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED"],
  APPROVED: ["LOCKED"],
  LOCKED: []
};

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return validTransitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Invalid state transition from ${from} to ${to}`);
  }
}
