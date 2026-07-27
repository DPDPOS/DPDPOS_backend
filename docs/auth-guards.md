# Auth guards for module authors (Developers A/B/C)

Protected routes must declare authentication and the exact `resource:action` permission from the frozen catalog in `src/shared/constants/permissions.ts`.

## Pattern

```ts
import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export function createExampleRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,                              // 1. verify Bearer JWT → req.context
    requirePermission(PERMISSIONS.DATA_ASSET_READ), // 2. check permissions
    (req, res, next) => void controller.list(req, res, next),
  );

  return router;
}
```

## RequestContext

After `authenticate`, handlers can read:

- `req.context.actorUserId`
- `req.context.organizationId`
- `req.context.permissions`
- `req.context.roles`
- `req.context.correlationId`
- `req.context.mfaVerified` (optional)

Use `getRequestContext(req)` from `src/shared/guards/auth.guard.ts` when you need a non-optional context.

## Token

Clients send:

```http
Authorization: Bearer <access_token>
```

Access token claims (signed with `JWT_ACCESS_SECRET`):

| Claim | Meaning |
|---|---|
| `sub` | user id |
| `organizationId` | tenant id |
| `permissions` | `resource:action` strings |
| `roles` | role names |
| `jti` | unique access-token id (used for logout deny-list) |
| `mfaVerified` | optional MFA assertion |

Issuance helpers live in `src/modules/auth/utils/jwt.ts` (`signAccessToken` / `verifyAccessToken`). Session APIs: `POST /api/v1/auth/login`, `/refresh`, `/logout`, and `GET /api/v1/auth/me`. Tests may still mint tokens with `signAccessToken`.

Logout optionally accepts the current Bearer access token so its `jti` is written to Redis (`auth:deny:jti:*`) until access TTL expires.

## Errors

| Case | HTTP | Code |
|---|---|---|
| Missing/invalid token | 401 | `UNAUTHORIZED` |
| Missing permission | 403 | `FORBIDDEN` |

## Rules

1. Never trust `organizationId` from the request body — use `req.context.organizationId`.
2. Only use permission strings from `PERMISSIONS` (or your module `*.permissions.ts` aliases).
3. Do not import another module’s repository/service internals; consume public `index.ts` only.
4. `POST /api/v1/organizations` remains public for tenant bootstrap until platform-admin auth exists.
