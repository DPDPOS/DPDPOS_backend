/** Normalize Entra object IDs, group display names, and LDAP DNs for matching. */
export function expandDirectoryGroupKeys(raw: string[]): string[] {
  const keys = new Set<string>();
  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    keys.add(trimmed);
    keys.add(trimmed.toLowerCase());
    const cn = trimmed.match(/^cn=([^,]+)/i)?.[1]?.trim();
    if (cn) {
      keys.add(cn);
      keys.add(cn.toLowerCase());
    }
  }
  return [...keys];
}

export function mapMatchesIncomingGroups(
  map: { externalGroupId: string; externalGroupName: string | null },
  incomingKeys: Set<string>,
): boolean {
  const id = map.externalGroupId.trim();
  const name = map.externalGroupName?.trim() ?? "";
  return (
    incomingKeys.has(id) ||
    incomingKeys.has(id.toLowerCase()) ||
    (name.length > 0 && (incomingKeys.has(name) || incomingKeys.has(name.toLowerCase())))
  );
}
