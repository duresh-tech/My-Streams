/** The name parts any customer-shaped row carries. */
export interface CustomerNameParts {
  customerAliasName?: string | null;
  fName: string;
  lName?: string | null;
}

/**
 * What a tenant or system user calls this customer.
 *
 * The internal alias wins when set - it is the name the operator actually uses
 * for them - and the real fName/lName is the fallback. Blank counts as unset,
 * so clearing the alias in the form reverts to the real name rather than
 * rendering an empty cell.
 *
 * Tenant and system portals only. The customer portal never receives the
 * alias: the API's PROFILE_SELECT is an allow list that leaves it out.
 */
export function customerDisplayName(customer: CustomerNameParts): string {
  const alias = customer.customerAliasName?.trim();
  if (alias) return alias;
  return [customer.fName, customer.lName].filter(Boolean).join(" ");
}
