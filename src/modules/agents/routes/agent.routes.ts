import { Router, Request, Response } from "express";
import { AgentOrchestrationService } from "../services/agent-orchestrator.service.js";

export function createAgentRouter(): Router {
  const router = Router();
  const orchestrator = AgentOrchestrationService.getInstance();

  router.post("/enroll", (req: Request, res: Response) => {
    const result = orchestrator.enroll(req.body);
    res.json(result);
  });

  router.post("/heartbeat", (req: Request, res: Response) => {
    const result = orchestrator.processHeartbeat(req.body);
    res.json(result);
  });

  router.post("/discovery", (req: Request, res: Response) => {
    orchestrator.ingestDiscovery(req.body);
    res.json({ success: true, message: "Discovery report ingested successfully" });
  });

  router.post("/receipt", (_req: Request, res: Response) => {
    res.json({ success: true, message: "Receipt acknowledged" });
  });

  router.get("/install-script", (req: Request, res: Response) => {
    const tenantId = (req.query.tenantId as string) || "tenant-default";
    const dbType = (req.query.dbType as string) || "postgres";
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const cpUrl = `${protocol}://${host}`;
    const script = orchestrator.generateEnrollmentScript(tenantId, dbType, cpUrl);
    res.json({ script });
  });

  router.get("/", (req: Request, res: Response) => {
    const tenantId = req.query.tenantId as string | undefined;
    const agents = orchestrator.listAgents(tenantId);
    res.json({ agents });
  });

  return router;
}
