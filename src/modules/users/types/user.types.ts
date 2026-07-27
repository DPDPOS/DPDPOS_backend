export type UserResponse = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  status: string;
  roleIds: string[];
  roleNames: string[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toUserResponse(user: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  status: string;
  roleIds?: string[];
  roleNames?: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    status: user.status,
    roleIds: user.roleIds ?? [],
    roleNames: user.roleNames ?? [],
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
