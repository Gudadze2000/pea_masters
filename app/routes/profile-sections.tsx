import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { APP_TITLE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { AppBar, inputClass } from "@/components/profile/shared";
import { CATEGORIES, SECTION_LABELS, SHAREABLE_CATEGORIES, categoryLabel, joinPeriod, splitPeriod, type Section } from "@/lib/profile-categories";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";

export function meta() {
  return [{ title: `Edit profile content — ${APP_TITLE}` }];
}

interface Entry {
  id: string;
  section: Section;
  category: string;
  title: string;
  organisation: string;
  role: string;
  period: string;
  description: string;
  visible: boolean;
}

interface EntryLink {
  id: string;
  entryId: string;
  publicationId: string;
}
interface Paper {
  id: string;
  title: string;
  year: number;
}
interface EntryShare {
  id: string;
  entryId: string;
  sharedWithEmail: string;
}
interface SharedEntry extends Entry {
  ownerName: string;
}

const SECTIONS: Section[] = ["professional", "teaching", "research"];

export default function ProfileSectionsPage() {
  const query = useActionQuery("list-entries", {});
  const entries = (query.data ?? []) as Entry[];
  const linksQuery = useActionQuery("list-entry-links", {});
  const links = (linksQuery.data ?? []) as EntryLink[];
  const myProfile = useActionQuery("get-my-profile", {});
  const papers = ((myProfile.data as { publications?: Paper[] } | undefined)?.publications ?? []) as Paper[];
  const [section, setSection] = useState<Section>("professional");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [adding, setAdding] = useState(false);
  const inSection = useMemo(() => entries.filter((e) => e.section === section), [entries, section]);

  const sharesQuery = useActionQuery("list-entry-shares", {});
  const shares = (sharesQuery.data ?? []) as EntryShare[];
  const sharedWithMeQuery = useActionQuery("list-shared-with-me", {});
  const sharedWithMe = ((sharedWithMeQuery.data ?? []) as SharedEntry[]).filter((e) => e.section === section);

  const refresh = () => {
    query.refetch();
    linksQuery.refetch();
    myProfile.refetch();
    sharesQuery.refetch();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar title="Edit profile content" />

      <main className="mx-auto max-w-3xl p-6 lg:p-10">
        <div className="inline-flex rounded-md border border-border p-1">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setSection(s); setEditing(null); setAdding(false); }}
              className={`rounded-sm px-4 py-1.5 text-sm ${section === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {s === "professional" ? "Professional" : s === "teaching" ? "Teaching" : "Research"}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{SECTION_LABELS[section]}. Entries marked Hidden are visible only to you.</p>

        {sharedWithMe.length > 0 && !(adding || editing) && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold">Shared with you</h2>
            <p className="mt-1 text-xs text-muted-foreground">Read-only. Only the person who shared these can change them.</p>
            <ul className="mt-3 flex flex-col gap-3">
              {sharedWithMe.map((e) => (
                <li key={`${e.id}-shared`} className="rounded-lg border border-dashed border-border bg-card px-5 py-4">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[categoryLabel(e.category), e.role, e.period].filter(Boolean).join(" · ")} · Shared by {e.ownerName}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(adding || editing) ? (
          <div className="mt-6">
            <EntryForm
              key={editing?.id ?? `new-${section}`}
              section={section}
              initial={editing}
              onDone={() => { setAdding(false); setEditing(null); refresh(); }}
              onCancel={() => { setAdding(false); setEditing(null); }}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <Button className="self-start" onClick={() => setAdding(true)}>Add entry</Button>
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : inSection.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing added to this section yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {inSection.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    links={links.filter((l) => l.entryId === e.id)}
                    papers={papers}
                    shares={shares.filter((x) => x.entryId === e.id)}
                    onEdit={() => setEditing(e)}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function EntryRow({
  entry,
  links,
  papers,
  shares,
  onEdit,
  onChanged,
}: {
  entry: Entry;
  links: EntryLink[];
  papers: Paper[];
  shares: EntryShare[];
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const save = useActionMutation("save-entry");
  const remove = useActionMutation("delete-entry");
  const [error, setError] = useState<string | null>(null);

  const toggleVisible = async () => {
    setError(null);
    try {
      await save.mutateAsync({ ...entry, visible: !entry.visible } as never);
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "Could not update this entry. Please try again."));
    }
  };
  const removeEntry = async () => {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    setError(null);
    try {
      await remove.mutateAsync({ id: entry.id } as never);
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "Could not delete this entry. Please try again."));
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{entry.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[categoryLabel(entry.category), entry.role, entry.organisation, entry.period].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs ${entry.visible ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}`}>
          {entry.visible ? "Shown" : "Hidden"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={save.isPending} onClick={toggleVisible}>
          {entry.visible ? "Hide" : "Show"}
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        {SHAREABLE_CATEGORIES.includes(entry.category) && (
          <Button variant="outline" size="sm" onClick={() => setSharing((v) => !v)}>
            {sharing ? "Close sharing" : `Share${shares.length ? ` (${shares.length})` : ""}`}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-destructive" disabled={remove.isPending} onClick={removeEntry}>Delete</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {sharing && <SharePanel entry={entry} shares={shares} onChanged={onChanged} />}
      {entry.section === "research" && (
        <LinkedPapers entry={entry} links={links} papers={papers} onChanged={onChanged} />
      )}
    </li>
  );
}

// Papers linked to a research item. Only the owner's own active publications can be linked.
function LinkedPapers({
  entry,
  links,
  papers,
  onChanged,
}: {
  entry: Entry;
  links: EntryLink[];
  papers: Paper[];
  onChanged: () => void;
}) {
  const link = useActionMutation("link-publication");
  const unlink = useActionMutation("unlink-publication");
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linked = links
    .map((l) => ({ link: l, paper: papers.find((p) => p.id === l.publicationId) }))
    .filter((x): x is { link: EntryLink; paper: Paper } => Boolean(x.paper));
  const available = papers.filter((p) => !links.some((l) => l.publicationId === p.id));

  const add = async () => {
    if (!choice) return;
    setError(null);
    try {
      await link.mutateAsync({ entryId: entry.id, publicationId: choice } as never);
      setChoice("");
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "The paper could not be linked. Please try again."));
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      await unlink.mutateAsync({ id } as never);
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "The paper could not be unlinked. Please try again."));
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted-foreground">Linked papers ({linked.length})</p>
      {linked.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {linked.map(({ link: l, paper }) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {paper.title} <span className="text-xs text-muted-foreground">({paper.year})</span>
              </span>
              <Button variant="ghost" size="sm" disabled={unlink.isPending} onClick={() => remove(l.id)}>Unlink</Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <div className="mt-3 flex gap-2">
          <select className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a publication…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.year})</option>
            ))}
          </select>
          <Button size="sm" disabled={!choice || link.isPending} onClick={add}>Link</Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {papers.length === 0 ? "Add publications first (on your profile page) to link them here." : "All your publications are already linked here."}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function EntryForm({
  section,
  initial,
  onDone,
  onCancel,
}: {
  section: Section;
  initial: Entry | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const save = useActionMutation("save-entry");
  const initialPeriod = splitPeriod(initial?.period ?? "");
  const [form, setForm] = useState({
    category: initial?.category ?? CATEGORIES[section][0].value,
    title: initial?.title ?? "",
    organisation: initial?.organisation ?? "",
    role: initial?.role ?? "",
    periodFrom: initialPeriod.from,
    periodTo: initialPeriod.to,
    description: initial?.description ?? "",
    visible: initial?.visible ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Enter a title.");
      return;
    }
    try {
      if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) {
        setError("The end date is before the start date. Please check the period.");
        return;
      }
      const { periodFrom, periodTo, ...rest } = form;
      await save.mutateAsync({
        ...(initial ? { id: initial.id } : {}),
        ...rest,
        period: joinPeriod(periodFrom, periodTo),
      } as never);
      toast.success(initial ? "Entry updated" : "Entry added");
      onDone();
    } catch (err) {
      setError(friendlyError(err, "The entry could not be saved. Please try again."));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-h3">{initial ? "Edit entry" : "New entry"}</h2>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Category
        <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES[section].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Organisation
          <input className={inputClass} value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Role
          <input className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          From
          <input type="date" className={inputClass} value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          To (leave empty if ongoing)
          <input type="date" className={inputClass} value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Description
        <textarea className={`${inputClass} h-auto min-h-20 py-2.5`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
        Show on my public profile
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save entry"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// Share a patent or research project with another person. They get a read-only view.
function SharePanel({ entry, shares, onChanged }: { entry: Entry; shares: EntryShare[]; onChanged: () => void }) {
  const share = useActionMutation("share-entry");
  const unshare = useActionMutation("unshare-entry");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await share.mutateAsync({ entryId: entry.id, email: email.trim() } as never);
      setEmail("");
      toast.success("Shared");
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "The item could not be shared. Please try again."));
    }
  };
  const stop = async (id: string) => {
    setError(null);
    try {
      await unshare.mutateAsync({ id } as never);
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "Sharing could not be stopped. Please try again."));
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted-foreground">Share with</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The person will see this item in their Edit profile content page, read-only, after signing in with this email.
      </p>
      {shares.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {shares.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{x.sharedWithEmail}</span>
              <Button variant="ghost" size="sm" disabled={unshare.isPending} onClick={() => stop(x.id)}>Stop sharing</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@iliauni.edu.ge" />
        <Button size="sm" disabled={!email.trim() || share.isPending} onClick={add}>Share</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
