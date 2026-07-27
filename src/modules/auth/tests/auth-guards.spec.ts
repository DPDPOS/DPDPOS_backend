import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { errorHandlerMiddleware } from "../../../shared/middleware/error-handler.middleware.js";
import { correlationIdMiddleware } from "../../../shared/middleware/correlation-id.middleware.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { signAccessToken } from "../utils/jwt.js";

function buildProbeApp() {
  const app = express();
  app.use(correlationIdMiddleware);
  app.get(
    "/secure",
    authenticate,
    requirePermission(PERMISSIONS.ORGANIZATION_READ),
    (req, res) => {
      sendSuccess(res, {
        actorUserId: (req as express.Request & { context?: { actorUserId: string } })
          .context?.actorUserId,
      });
    },
  );
  app.use(errorHandlerMiddleware);
  return app;
}

describe("auth contract guards", () => {
  const organizationId = randomUUID();
  const actorUserId = randomUUID();

  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(buildProbeApp()).get("/secure").expect(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(buildProbeApp())
      .get("/secure")
      .set("Authorization", "Bearer not-a-jwt")
      .expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the token is valid but permission is missing", async () => {
    const token = signAccessToken({
      actorUserId,
      organizationId,
      roles: ["MEMBER"],
      permissions: [PERMISSIONS.NOTIFICATION_READ],
    });

    const res = await request(buildProbeApp())
      .get("/secure")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows access when the required permission is present", async () => {
    const token = signAccessToken({
      actorUserId,
      organizationId,
      roles: ["DPO"],
      permissions: [PERMISSIONS.ORGANIZATION_READ],
    });

    const res = await request(buildProbeApp())
      .get("/secure")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.actorUserId).toBe(actorUserId);
  });
});
