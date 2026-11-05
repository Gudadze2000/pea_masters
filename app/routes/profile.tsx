import { useState } from "react";
import { Link } from "react-router";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { APP_TITLE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { AppBar, PUBLICATION_TYPES, PublicationList, inputClass } from "@/components/profile/shared";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";

export function meta() {
  return [{ title: `My profile — ${APP_TITLE}` }];
}

interface Profile {
  ownerEmail: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  university: string;
  position: string;
  department: string;
  bio: string;
  isPublic: boolean;
}
interface Publication {
  id: string;
  title: string;
  year: number;
  type: string;
  journal: string;
  doi: string;
  authors: string;
}

const EMPTY_PUB = {
  title: "",
  year: new Date().getFullYear(),
  type: "Peer Reviewed Journal",
  journal: "",
  doi: "",
  authors: "",
};

export default function MyProfile() {
  const query = useActionQuery("get-my-profile", {});
  const data = query.data as
    | { profile: Profile; publications: Publication[]; deleted: Publication[] }
    | undefined;

  if (query.isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Loading your profile…</div>;
  }
  if (!data) {
    return (
      <div className="p-10 text-sm text-destructive">
        Could not load your profile. <Link className="underline" to="/">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar title="My profile" />

      <main className="mx-auto grid max-w-5xl gap-8 p-6 lg:grid-cols-[1fr_1.4fr] lg:p-10">
        <div className="flex flex-col gap-8">
          <PhotoCard />
          <VisibilityCard profile={data.profile} onChanged={() => query.refetch()} />
          <DetailsCard profile={data.profile} onSaved={() => query.refetch()} />
        </div>
        <div className="flex flex-col gap-8">
          <AddPublicationCard onAdded={() => query.refetch()} />
          <section>
            <h2 className="mb-4 text-h3">Publications ({data.publications.length})</h2>
            <PublicationList
              items={data.publications}
              emptyText="No publications yet. Add one above."
            >
              {(item) => <RemoveButton id={item.id} label="Remove" nextStatus="deleted" onDone={() => query.refetch()} />}
            </PublicationList>
          </section>
          {data.deleted.length > 0 && (
            <section>
              <h2 className="mb-4 text-h3 text-muted-foreground">Removed from profile</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Restore a publication to show it again, or delete it permanently. Permanent deletion cannot be undone.
              </p>
              <PublicationList items={data.deleted} emptyText="">
                {(item) => (
                  <div className="flex flex-col gap-2">
                    <RemoveButton id={item.id} label="Restore" nextStatus="active" onDone={() => query.refetch()} />
                    <DeletePermanentlyButton id={item.id} onDone={() => query.refetch()} />
                  </div>
                )}
              </PublicationList>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// Full profile payload, so saving one section never clears another.
function toPayload(profile: Profile, overrides: Partial<Profile> = {}) {
  const merged = { ...profile, ...overrides };
  return {
    firstName: merged.firstName,
    lastName: merged.lastName,
    birthDate: merged.birthDate,
    university: merged.university,
    position: merged.position,
    department: merged.department,
    bio: merged.bio,
    isPublic: merged.isPublic,
  };
}

function VisibilityCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const update = useActionMutation("update-my-profile");
  const [error, setError] = useState<string | null>(null);

  const setPublic = async (isPublic: boolean) => {
    setError(null);
    try {
      await update.mutateAsync(toPayload(profile, { isPublic }) as never);
      onChanged();
    } catch (err) {
      setError(friendlyError(err, "Could not change visibility. Please try again."));
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-h3">Profile visibility</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {profile.isPublic
          ? "Public: anyone, including guests who are not signed in, can see your profile and publications."
          : "Private: only you can see your profile and publications."}
      </p>
      <div className="mt-4 inline-flex rounded-md border border-border p-1">
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => setPublic(false)}
          className={`rounded-sm px-4 py-1.5 text-sm ${!profile.isPublic ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Private
        </button>
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => setPublic(true)}
          className={`rounded-sm px-4 py-1.5 text-sm ${profile.isPublic ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Public
        </button>
      </div>
      {profile.isPublic && (
        <p className="mt-4 text-xs">
          Public link:{" "}
          <Link className="text-primary underline" to={`/people?email=${encodeURIComponent(profile.ownerEmail)}`}>
            /people?email={profile.ownerEmail}
          </Link>
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function DetailsCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const update = useActionMutation("update-my-profile");
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    university: profile.university,
    position: profile.position,
    department: profile.department,
    bio: profile.bio,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const emptyFields: string[] = [];
    if (!form.firstName.trim()) emptyFields.push("first name");
    if (!form.lastName.trim()) emptyFields.push("last name");
    if (!form.birthDate) emptyFields.push("date of birth");
    if (!form.university.trim()) emptyFields.push("university");
    if (!form.position.trim()) emptyFields.push("position");
    if (!form.department.trim()) emptyFields.push("department");
    if (!form.bio.trim()) emptyFields.push("biography");
    if (emptyFields.length > 0) {
      const ok = window.confirm(
        `These details are empty: ${emptyFields.join(", ")}.\n\nVisitors will see blank fields on your public profile. Save anyway?`,
      );
      if (!ok) return;
    }
    try {
      await update.mutateAsync(toPayload(profile, form) as never);
      setSaved(true);
      toast.success("Details saved");
      onSaved();
    } catch (err) {
      setError(friendlyError(err, "Details could not be saved. Please try again."));
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-h3">Details</h2>
      <p className="mt-1 text-xs text-muted-foreground">Shown on your public profile when it's set to Public.</p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            First name
            <input className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Last name
            <input className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Date of birth
          <input type="date" className={inputClass} value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          University
          <input className={inputClass} value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} placeholder="Ilia State University" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Position
            <input className={inputClass} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Department
            <input className={inputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Biography
          <textarea
            className={`${inputClass} h-auto min-h-28 py-2.5`}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </form>
    </section>
  );
}

function AddPublicationCard({ onAdded }: { onAdded: () => void }) {
  const add = useActionMutation("add-publication");
  const [form, setForm] = useState(EMPTY_PUB);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Enter the publication title.");
      return;
    }
    try {
      await add.mutateAsync({ ...form, year: Number(form.year) } as never);
      setForm({ ...EMPTY_PUB, year: form.year });
      onAdded();
    } catch (err) {
      setError(friendlyError(err, "The publication could not be added. Please try again."));
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-h3">Add a publication</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Title
          <input maxLength={500} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <span className="text-xs font-normal text-muted-foreground">{form.title.length} / 500 characters</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Year
            <input type="number" min={1900} max={2100} className={inputClass} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Type
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {PUBLICATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Journal or venue
          <input className={inputClass} value={form.journal} onChange={(e) => setForm({ ...form, journal: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Authors
          <input className={inputClass} value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} placeholder="Surname I., Surname I." />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          DOI (optional)
          <input className={inputClass} value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} placeholder="10.1016/..." />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add publication"}
        </Button>
      </form>
    </section>
  );
}

function RemoveButton({
  id,
  label,
  nextStatus,
  onDone,
}: {
  id: string;
  label: string;
  nextStatus: "active" | "deleted";
  onDone: () => void;
}) {
  const setStatus = useActionMutation("set-publication-status");
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (nextStatus === "deleted" && !window.confirm("Remove this publication from your profile? You can restore it later.")) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ id, status: nextStatus } as never);
      onDone();
    } catch (err) {
      setError(friendlyError(err, "This could not be changed. Please try again."));
    }
  };
  return (
    <Button variant="outline" size="sm" disabled={setStatus.isPending} onClick={run}>
      {label}
    </Button>
  );
}

function DeletePermanentlyButton({ id, onDone }: { id: string; onDone: () => void }) {
  const remove = useActionMutation("delete-publication");
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!window.confirm("Delete this publication permanently? This cannot be undone.")) return;
    setError(null);
    try {
      await remove.mutateAsync({ id } as never);
      toast.success("Publication deleted permanently");
      onDone();
    } catch (err) {
      setError(friendlyError(err, "The publication could not be deleted. Please try again."));
    }
  };
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" disabled={remove.isPending} onClick={run}>
        Delete permanently
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </>
  );
}

const MAX_PHOTO_MB = 2;

function PhotoCard() {
  const photo = useActionQuery("get-my-photo", {});
  const setPhoto = useActionMutation("set-profile-photo");
  const removePhoto = useActionMutation("remove-profile-photo");
  const [error, setError] = useState<string | null>(null);
  const dataUrl = (photo.data as { dataUrl?: string | null } | undefined)?.dataUrl ?? null;

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`This photo is too large. Please choose an image under ${MAX_PHOTO_MB} MB.`);
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!url) {
      setError("The photo could not be read. Please try another image.");
      return;
    }
    try {
      await setPhoto.mutateAsync({ dataUrl: url } as never);
      toast.success("Photo updated");
      photo.refetch();
    } catch (err) {
      setError(friendlyError(err, "The photo could not be saved. Please try again."));
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove your profile photo?")) return;
    setError(null);
    try {
      await removePhoto.mutateAsync({} as never);
      toast.success("Photo removed");
      photo.refetch();
    } catch (err) {
      setError(friendlyError(err, "The photo could not be removed. Please try again."));
    }
  };

  const busy = setPhoto.isPending || removePhoto.isPending;
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-h3">Profile photo</h2>
      <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP, up to {MAX_PHOTO_MB} MB. Shown on your public profile when it's public.</p>
      <div className="mt-4 flex items-center gap-5">
        {dataUrl ? (
          <img src={dataUrl} alt="Your profile photo" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-xs text-muted-foreground">No photo</div>
        )}
        <div className="flex flex-col gap-2">
          <label className={`inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground ${busy ? "opacity-60" : ""}`}>
            {dataUrl ? "Change photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {dataUrl && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>Remove photo</Button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
