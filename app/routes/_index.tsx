import { Link } from "react-router";
import { signOut } from "@agent-native/core/client";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { APP_TITLE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile/avatar";

export function meta() {
  return [{ title: APP_TITLE }];
}

// Researcher home: the signed-in starting point for everything else.
export default function HomeRoute() {
  const me = useActionQuery("get-my-profile", {});
  const data = me.data as
    | { profile: { firstName: string; lastName: string; isPublic: boolean }; publications: unknown[] }
    | undefined;
  const name = data ? [data.profile.firstName, data.profile.lastName].filter(Boolean).join(" ") : "";

  const cards = [
    { to: "/profile", title: "My profile", text: "Your photo, details, publications and visibility." },
    { to: "/profile-sections", title: "Edit profile content", text: "Professional, teaching and research entries, patents and shared projects." },
    { to: "/preferences", title: "Preferences", text: "Author names, organisation, identifiers, language and alerts." },
    { to: "/profiles", title: "Researchers", text: "Browse public researcher profiles." },
    { to: "/evaluations", title: "Evaluations", text: "Personnel evaluations you have written. Private to you." },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">PEA</div>
          <span className="text-sm font-semibold">Home</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/profiles" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Researchers</Link>
          <ProfileAvatar size={36} />
          <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-6 lg:p-10">
        <h1 className="text-2xl font-semibold tracking-tight">{name ? `Welcome, ${name}` : "Welcome"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data
            ? data.profile.isPublic
              ? "Your profile is public. Anyone can see it."
              : "Your profile is private. Only you can see it."
            : "Loading your profile…"}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="rounded-[12px] border border-border bg-card p-6 hover:border-primary/40 hover:bg-accent"
            >
              <h2 className="text-base font-semibold">{c.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
