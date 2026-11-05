import { Link, useLocation } from "react-router";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { ProfileAvatar } from "@/components/profile/avatar";

export const PUBLICATION_TYPES = [
  "Peer Reviewed Journal",
  "Conference Contribution",
  "Book",
  "Book Chapter",
  "Patent",
  "Other",
];

export const inputClass =
  "h-control w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export function useSignedIn() {
  const me = useActionQuery("get-my-profile", {});
  return { signedIn: me.isSuccess };
}

export function fullName(p: { firstName?: string; lastName?: string; displayName?: string; ownerEmail: string }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || p.displayName || p.ownerEmail;
}

// One header for every page except Home. The back link always goes to Home (signed in)
// or to sign-in (guest). "Researchers" is hidden on the Researchers page itself.
export function AppBar({ title }: { title?: string }) {
  const { signedIn } = useSignedIn();
  const { pathname } = useLocation();
  const onResearchers = pathname === "/profiles";
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 lg:px-10">
      <div className="flex min-w-0 items-center gap-4">
        <Link to="/" className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          {signedIn ? "← Home" : "← Sign in"}
        </Link>
        {title && <h1 className="truncate text-h3 tracking-tight">{title}</h1>}
      </div>
      <nav className="flex shrink-0 items-center gap-4 text-sm">
        {!onResearchers && (
          <Link to="/profiles" className="text-muted-foreground hover:text-foreground">Researchers</Link>
        )}
        {signedIn && <ProfileAvatar size={32} />}
      </nav>
    </header>
  );
}

// Kept for pages that only need the default bar.
export function GuestHeader() {
  return <AppBar />;
}

export function PublicationList({
  items,
  emptyText,
  children,
  linkTitles = false,
}: {
  items: Array<{ id: string; title: string; year: number; type: string; journal: string; doi: string; authors: string }>;
  emptyText: string;
  children?: (item: { id: string }) => React.ReactNode;
  linkTitles?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
          <div className="min-w-0">
            {linkTitles ? (
              <Link to={`/publication?id=${encodeURIComponent(p.id)}`} className="text-sm font-semibold hover:text-primary hover:underline">
                {p.title}
              </Link>
            ) : (
              <p className="text-sm font-semibold">{p.title}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {[p.year, p.type, p.journal].filter(Boolean).join(" · ")}
            </p>
            {p.authors && <p className="mt-1 text-xs text-muted-foreground">{p.authors}</p>}
            {p.doi && (
              <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">
                doi:{p.doi}
              </a>
            )}
          </div>
          {children && <div className="shrink-0">{children({ id: p.id })}</div>}
        </li>
      ))}
    </ul>
  );
}
