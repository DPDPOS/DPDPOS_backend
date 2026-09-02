import type { BaseDomainEvent } from "../../../../events/types/base-event.interface.js";
import { evidenceLedgerService } from "../../services/evidence-ledger.service.js";

const ID_KEYS = [
  "consentRecordId",
  "requestId",
  "agentId",
  "catalogRevisionId",
  "violationId",
  "taskId",
] as const;

export async function onLedgerEvent(event: BaseDomainEvent): Promise<void> {
  const payload = event.payload as Record<string, unknown>;
  const idKey = ID_KEYS.find((key) => typeof payload[key] === "string");
  const agentEvent =
    event.eventType === "AgentEnrolled" ||
    event.eventType === "CatalogRevisionCreated" ||
    event.eventType === "DsrTaskEscalated";

  await evidenceLedgerService.appendEvent({
    organizationId: event.organizationId,
    eventType: event.eventType,
    actorType: event.actorUserId ? "USER" : agentEvent ? "AGENT" : "SYSTEM",
    actorId:
      event.actorUserId ??
      (agentEvent && typeof payload.agentId === "string" ? payload.agentId : null),
    objectType: event.eventType,
    objectId:
      (idKey ? String(payload[idKey]) : undefined) ?? event.eventId,
    payload,
    occurredAt: new Date(event.occurredAt),
  });
}
