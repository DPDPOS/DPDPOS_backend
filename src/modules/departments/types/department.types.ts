export type DepartmentResponse = {
  id: string;
  organizationId: string;
  name: string;
  headUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toDepartmentResponse(dept: {
  id: string;
  organizationId: string;
  name: string;
  headUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DepartmentResponse {
  return {
    id: dept.id,
    organizationId: dept.organizationId,
    name: dept.name,
    headUserId: dept.headUserId,
    createdAt: dept.createdAt.toISOString(),
    updatedAt: dept.updatedAt.toISOString(),
  };
}
