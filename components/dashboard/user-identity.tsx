import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Initials from a display name. Falls back to "?" rather than rendering blank. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * A person, with their role.
 *
 * Role is shown beside the name because TANIA's entire authorization model is
 * role- and scope-based: knowing *which* Chapter Lead you are looking at
 * matters. The avatar image is decorative (alt="") since the name is adjacent
 * text — duplicating it would make screen readers read the person twice.
 */
export function UserIdentity({
  name,
  role,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  role?: string | undefined;
  avatarUrl?: string | undefined;
  size?: "sm" | "md";
  className?: string | undefined;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Avatar className={size === "sm" ? "size-7" : "size-9"}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-[var(--color-telkom-blue-100)] text-xs font-medium text-[var(--color-telkom-navy)]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-900">
          {name}
        </span>
        {role ? (
          <span className="block truncate text-xs text-slate-500">{role}</span>
        ) : null}
      </span>
    </span>
  );
}
