import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { APP_TITLE } from "@/lib/app-config";
import { GuestHeader, fullName } from "@/components/profile/shared";

export function meta() {
  return [{ title: `Publication — ${APP_TITLE}` }];
}

interface PublicationResponse {
  publication: {
    id: string;
    title: string;
    year: number;
    type: string;
    journal: string;
    doi: string;
    authors: string;
  };
  author: { ownerEmail: string; firstName: string; lastName: string; university: string };
}

// Guest-accessible publication page: /publication?id=...
export default function PublicationPage() {
  const [params] = useSearchParams();
  const id = (params.get("id") ?? "").trim();
  const query = useQuery({
    queryKey: ["public-publication", id],
    enabled: id.length > 0,
    queryFn: async () => {
      const res = await fetch(`/api/public/publication?id=${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load publication");
      return (await res.json()) as PublicationResponse;
    },
  });
  const data = query.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GuestHeader />
      <main className="mx-auto max-w-3xl p-6 lg:p-10">
        {!id ? (
          <p className="mt-6 text-sm text-muted-foreground">No publication selected.</p>
        ) : query.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <p className="mt-6 text-sm text-destructive">Could not load this publication. Please refresh.</p>
        ) : !data ? (
          <div className="mt-6 rounded-lg border border-dashed border-border px-8 py-14 text-center">
            <h1 className="text-h3">Publication not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">It was removed, or its owner's profile is private.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-h1">{data.publication.title}</h1>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Year" value={String(data.publication.year)} />
              <Detail label="Type" value={data.publication.type} />
              <Detail label="Journal or venue" value={data.publication.journal} />
              <Detail label="Authors" value={data.publication.authors} />
              <Detail label="DOI" value={data.publication.doi} />
            </dl>
            <p className="mt-8 text-sm">
              Listed by{" "}
              <Link to={`/people?email=${encodeURIComponent(data.author.ownerEmail)}`} className="text-primary hover:underline">
                {fullName({ ...data.author, ownerEmail: data.author.ownerEmail })}
              </Link>
              {data.author.university ? `, ${data.author.university}` : ""}
            </p>
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
      <dd className="mt-0.5 break-words">{value || "—"}</dd>
    </div>
  );
}
