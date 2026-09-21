/**
 * External system boundaries.
 *
 * TANIA owns talent, capability, performance and development. It does not own
 * finance or time recording, and pretending otherwise is how fabricated
 * numbers get into a product.
 *
 * Declaring the boundary explicitly means a screen can say "SAP owns this and
 * is not connected" rather than showing a blank, a zero, or a plausible
 * estimate.
 */

export interface ExternalSystem {
  readonly code: string;
  readonly name: string;
  /** What this system is the system of record for. */
  readonly owns: readonly string[];
  /** Environment variable that, when set, indicates an integration exists. */
  readonly configuredBy: string | null;
}

export const EXTERNAL_SYSTEMS: readonly ExternalSystem[] = [
  {
    code: "sap",
    name: "SAP",
    owns: ["budget commitment", "budget realization", "cost centre"],
    // No variable is defined yet: the integration has not been specified.
    configuredBy: null,
  },
  {
    code: "timesheet",
    name: "Timesheet system",
    owns: ["recorded hours", "utilization actuals"],
    configuredBy: null,
  },
  {
    code: "entra",
    name: "Microsoft Entra ID",
    owns: ["identity", "group membership"],
    configuredBy: "ENTRA_TENANT_ID",
  },
];

export function findSystem(code: string): ExternalSystem | undefined {
  return EXTERNAL_SYSTEMS.find((s) => s.code === code);
}

/**
 * Whether an integration is configured.
 *
 * A system with no `configuredBy` variable is not merely unconfigured — no
 * integration has been specified for it at all. Both cases report false; the
 * UI distinguishes them so an operator knows whether to set a variable or to
 * commission work.
 */
export function isIntegrationConfigured(system: ExternalSystem): boolean {
  if (!system.configuredBy) return false;
  return Boolean(process.env[system.configuredBy]);
}

export function integrationState(
  system: ExternalSystem,
): "configured" | "unconfigured" | "not-specified" {
  if (!system.configuredBy) return "not-specified";
  return process.env[system.configuredBy] ? "configured" : "unconfigured";
}
