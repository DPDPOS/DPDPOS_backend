export type RoleResponse = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toRoleResponse(role: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}): RoleResponse {
  return {
    id: role.id,
    organizationId: role.organizationId,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    isSystemRole: role.isSystemRole,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}
