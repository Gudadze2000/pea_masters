import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { APP_TITLE } from "@/lib/app-config";
import { AppBar, GuestHeader, fullName } from "@/components/profile/shared";
import { useActionQuery } from "@agent-native/core/client/hooks";

export function meta() {
  return [{ title: `Researcher profiles — ${APP_TITLE}` }];
}

interface PublicSummary {
  ownerEmail: string;
  firstName: string;
  lastName: string;
  university: string;
  position: string;
  department: string;
  bio: string;
  hasPhoto: boolean;
  publicationCount: number;
}

function excerpt(text: string, max = 160) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

// Guest-accessible directory of profiles that their owners have made public.
export default function ProfilesDirectory() {
  const list = useQuery({
    queryKey: ["public-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/public/profiles");
      if (!res.ok) throw new Error("Could not load profiles");
      return (await res.json()) as PublicSummary[];
    },
  });
  // Hide the signed-in user's own profile: the directory lists other researchers only.
  const me = useActionQuery("get-my-profile", {});
  const myEmail = (me.data as { profile?: { ownerEmail: string } } | undefined)?.profile?.ownerEmail;
  const profiles = (list.data ?? []).filter((p) => p.ownerEmail !== myEmail);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar title="Researchers" />
      <main className="mx-auto max-w-3xl p-6 lg:p-10">
        <p className="mt-1 text-sm text-muted-foreground">Profiles that their owners have chosen to make public.</p>

        {list.isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <p className="mt-8 text-sm text-destructive">Could not load the directory. Please refresh.</p>
        ) : profiles.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">No public profiles yet.</p>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {profiles.map((p) => (
              <li key={p.ownerEmail}>
                <Link
                  to={`/people?email=${encodeURIComponent(p.ownerEmail)}`}
                  className="flex gap-4 rounded-lg border border-border bg-card px-5 py-4 hover:border-primary/40 hover:bg-accent"
                >
                  {p.hasPhoto ? (
                    <img
                      src={`/api/public/photo?email=${encodeURIComponent(p.ownerEmail)}`}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-primary">
                      {(p.firstName || p.lastName || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold">{fullName(p)}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.publicationCount} publication{p.publicationCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[p.university, p.department].filter(Boolean).join(" · ") || "No affiliation listed"}
                    </p>
                    {p.bio && <p className="mt-2 text-sm leading-[20px] text-foreground/80">{excerpt(p.bio)}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
