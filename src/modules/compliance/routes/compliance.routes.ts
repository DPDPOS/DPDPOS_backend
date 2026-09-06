import { Router, Request, Response } from "express";
import { ComplianceGovernanceService } from "../services/compliance.service.js";
import { AgentOrchestrationService } from "../../agents/services/agent-orchestrator.service.js";

export function createComplianceRouter(): Router {
  const router = Router();
  const compliance = ComplianceGovernanceService.getInstance();
  const orchestrator = AgentOrchestrationService.getInstance();

  const getTenantId = (req: Request): string => {
    return (
      (req.headers["x-tenant-id"] as string) ||
      (req.query.tenantId as string) ||
      (req.body && req.body.tenantId) ||
      "tenant-default"
    );
  };

  // Compliance Scoring & Evaluation
  router.get("/compliance/report", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const report = compliance.getLatestReport(tenantId);
    res.json(report);
  });

  router.post("/compliance/evaluate", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const report = compliance.generateReport(tenantId);
    res.json(report);
  });

  router.post("/compliance/remediate", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const updatedReport = compliance.applyRemediation(tenantId, req.body);
    res.json({ success: true, updatedReport });
  });

  // Dashboard Overview & Catalog
  router.get("/dashboard/stats", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const stats = compliance.getDashboardStats(tenantId);
    res.json(stats);
  });

  router.get("/catalog/datamap", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const dataMap = orchestrator.getDataMap(tenantId);
    res.json(dataMap);
  });

  router.get("/agents", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const agents = orchestrator.listAgents(tenantId);
    res.json({ agents });
  });

  // Audit Logs (ISO 27001 A.8.15)
  router.get("/audit/logs", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const limit = Number(req.query.limit) || 100;
    const logs = compliance.getAuditLogs(tenantId, limit);
    res.json({ logs });
  });

  // Consent & Notice Endpoints
  router.get("/consent/notices", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const notices = compliance.getNotices(tenantId);
    res.json({ notices });
  });

  router.post("/consent/notices", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { version, title, purposes } = req.body;
    const notice = compliance.createNotice(tenantId, version, title, purposes);
    res.status(201).json(notice);
  });

  router.post("/consent/record", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { principalId, noticeVersion, consentedPurposes, channel } = req.body;
    const record = compliance.recordConsent(
      tenantId,
      principalId,
      noticeVersion,
      consentedPurposes,
      channel
    );
    res.json({ success: true, record });
  });

  router.get("/consent/check", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const principalId = (req.query.principalId as string) || "";
    const record = compliance.getConsent(tenantId, principalId);
    res.json({
      hasConsent: !!record && record.noticeVersion !== "WITHDRAWN",
      record,
    });
  });

  // DSR 3-Stage Lifecycle Endpoints
  router.get("/dsr/requests", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const requests = compliance.listDsrs(tenantId);
    res.json({ requests });
  });

  router.post("/dsr/request", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { principalId, requestType, requestedBy, gracePeriodDays } = req.body;
    const request = compliance.submitDsr(
      tenantId,
      principalId,
      requestType,
      requestedBy,
      gracePeriodDays
    );
    res.status(201).json({ success: true, request });
  });

  router.post("/dsr/:id/approve", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const dsrId = req.params.id as string;
    const { dpoUserId, notes } = req.body;
    const request = compliance.approveDsr(tenantId, dsrId, dpoUserId || "DPO", notes);
    if (!request) {
      res.status(400).json({ error: "Unable to approve DSR in current state" });
      return;
    }
    res.json({ success: true, request });
  });

  router.post("/dsr/:id/reject", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const dsrId = req.params.id as string;
    const { dpoUserId, reason } = req.body;
    const request = compliance.rejectDsr(tenantId, dsrId, dpoUserId || "DPO", reason || "Legal retention requirement");
    if (!request) {
      res.status(400).json({ error: "Unable to reject DSR in current state" });
      return;
    }
    res.json({ success: true, request });
  });

  router.post("/dsr/:id/restore", (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const dsrId = req.params.id as string;
    const { reason } = req.body;
    const request = compliance.restoreDsr(tenantId, dsrId, reason || "Customer login during grace period");
    if (!request) {
      res.status(400).json({ error: "Unable to restore DSR in current state" });
      return;
    }
    res.json({ success: true, request });
  });

  return router;
}
