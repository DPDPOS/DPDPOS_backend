export { createAuthRouter } from "./routes/auth.routes.js";
export { authService } from "./services/auth.service.js";
export { authPermissions } from "./permissions/auth.permissions.js";
export type {
  LoginDto,
  RefreshDto,
  LogoutDto,
  AcceptInviteDto,
  MfaConfirmDto,
  MfaVerifyDto,
} from "./dto/auth.dto.js";
export type {
  AuthMeResponse,
  LoginResult,
  AuthTokens,
} from "./services/auth.service.js";
export { UserLoggedInEventType, type UserLoggedInEvent } from "./events/user-logged-in.event.js";
export {
  signAccessToken,
  verifyAccessToken,
  extractBearerToken,
  type AccessTokenPayload,
  type SignAccessTokenInput,
} from "./utils/jwt.js";
export { requireMfa } from "../../shared/middleware/require-mfa.middleware.js";
export { MFA_PRIVILEGED_ROLES, isPrivilegedRoleSet } from "./utils/mfa.js";
