/**
 * Approval requirement, shared by every agent that proposes something.
 *
 * `required` is the literal true rather than a boolean. No agent in TANIA
 * returns "no approval needed" for a consequential proposal, so there is no
 * false case to represent, and a caller cannot branch on one.
 */

export interface ApprovalRequirement<TPermission extends string = string> {
  readonly required: true;
  readonly permission: TPermission;
  readonly approverRoles: readonly string[];
  readonly whyRequired: string;
  /** Exactly what a human would be committing to by approving. */
  readonly whatWouldBeCommitted: readonly string[];
}
