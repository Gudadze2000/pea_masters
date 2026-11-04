import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { APP_TITLE } from "@/lib/app-config";
import { GuestHeader, PublicationList, fullName } from "@/components/profile/shared";
import { SECTION_LABELS, categoryLabel, type Section } from "@/lib/profile-categories";

export function meta() {
  return [{ title: `Researcher profile — ${APP_TITLE}` }];
}

interface PublicProfile {
  ownerEmail: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  university: string;
  position: string;
  department: string;
  bio: string;
}
interface PublicEntry {
  papers?: Array<{ id: string; title: string; year: number }>;
  id: string;
  section: "professional" | "teaching" | "research";
  category: string;
  title: string;
  organisation: string;
  role: string;
  period: string;
  description: string;
}
interface PublicProfileResponse {
  hasPhoto?: boolean;
  profile: PublicProfile;
  entries: PublicEntry[];
  publications: Array<{ id: string; title: string; year: number; type: string; journal: string; doi: string; authors: string }>;
}

// Guest-accessible public profile, addressed as /people?email=... so the email
// never has to be encoded into the path. Private or unknown profiles show "not available".
export default function PublicProfilePage() {
  const [params] = useSearchParams();
  const email = (params.get("email") ?? "").trim();
  const query = useQuery({
    queryKey: ["public-profile", email],
    enabled: email.length > 0,
    queryFn: async () => {
      const res = await fetch(`/api/public/profile?email=${encodeURIComponent(email)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load profile");
      const body = (await res.json()) as PublicProfileResponse | { error?: string };
      if (!("profile" in body)) return null;
      return body;
    },
  });
  const data = query.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GuestHeader />
      <main className="mx-auto max-w-3xl p-6 lg:p-10">

        {!email ? (
          <p className="mt-6 text-sm text-muted-foreground">No researcher selected.</p>
        ) : query.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <p className="mt-6 text-sm text-destructive">Could not load this profile. Please refresh.</p>
        ) : !data ? (
          <div className="mt-6 rounded-[10px] border border-dashed border-border px-8 py-14 text-center">
            <h1 className="text-base font-semibold">Profile not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">This profile does not exist or is private.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-5">
              {data.hasPhoto ? (
                <img
                  src={`/api/public/photo?email=${encodeURIComponent(data.profile.ownerEmail)}`}
                  alt={`Photo of ${fullName(data.profile)}`}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight">{fullName(data.profile)}</h1>
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="University" value={data.profile.university} />
              <Detail label="Position" value={data.profile.position} />
              <Detail label="Department" value={data.profile.department} />
              <Detail label="Date of birth" value={data.profile.birthDate} />
            </dl>

            {data.profile.bio && (
              <section className="mt-8">
                <h2 className="text-base font-semibold">Biography</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-[22px]">{data.profile.bio}</p>
              </section>
            )}

            {(["professional", "teaching", "research"] as Section[]).map((sec) => {
              const items = (data.entries ?? []).filter((e) => e.section === sec);
              if (items.length === 0) return null;
              return (
                <section key={sec} className="mt-8">
                  <h2 className="text-base font-semibold">{SECTION_LABELS[sec]}</h2>
                  <ul className="mt-3 flex flex-col gap-3">
                    {items.map((e) => (
                      <li key={e.id} className="rounded-[10px] border border-border bg-card px-5 py-4">
                        <p className="text-sm font-semibold">{e.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[categoryLabel(e.category), e.role, e.organisation, e.period].filter(Boolean).join(" · ")}
                        </p>
                        {e.description && <p className="mt-2 text-sm">{e.description}</p>}
                        {(e.papers ?? []).length > 0 && (
                          <div className="mt-3 border-t border-border pt-3">
                            <p className="text-xs font-medium text-muted-foreground">Related publications</p>
                            <ul className="mt-2 flex flex-col gap-1 text-sm">
                              {(e.papers ?? []).map((p) => (
                                <li key={p.id}>
                                  <Link to={`/publication?id=${encodeURIComponent(p.id)}`} className="text-primary hover:underline">
                                    {p.title}
                                  </Link>{" "}
                                  <span className="text-xs text-muted-foreground">({p.year})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            <section className="mt-8">
              <h2 className="text-base font-semibold">Publications ({data.publications.length})</h2>
              <div className="mt-4">
                <PublicationList items={data.publications} emptyText="No publications listed." linkTitles />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || "—"}</dd>
    </div>
  );
}
