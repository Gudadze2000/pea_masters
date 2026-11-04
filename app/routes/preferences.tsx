import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { APP_TITLE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { AppBar, inputClass } from "@/components/profile/shared";
import { LANGUAGES } from "@/lib/profile-categories";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";

export function meta() {
  return [{ title: `Preferences — ${APP_TITLE}` }];
}

interface Prefs {
  authorAliases: string;
  keywords: string;
  structuralUnit: string;
  subUnit: string;
  scopusId: string;
  wosId: string;
  orcidId: string;
  language: string;
  receiveAlerts: boolean;
  autoAddPublications: boolean;
}

const toLines = (text: string) => text.split("\n").map((x) => x.trim()).filter(Boolean);

export default function PreferencesPage() {
  const query = useActionQuery("get-preferences", {});
  const data = query.data as Prefs | undefined;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar title="Preferences" />
      <main className="mx-auto max-w-2xl p-6 lg:p-10">
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <PreferencesForm key={JSON.stringify(data)} initial={data} />
        )}
      </main>
    </div>
  );
}

function PreferencesForm({ initial }: { initial: Prefs }) {
  const save = useActionMutation("update-preferences");
  const [form, setForm] = useState<Prefs>(initial);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync({
        ...form,
        authorAliases: toLines(form.authorAliases).join("\n"),
        keywords: toLines(form.keywords).join("\n"),
      } as never);
      setMessage({ kind: "ok", text: "Preferences saved." });
      toast.success("Preferences saved");
    } catch (err) {
      const text = friendlyError(err, "Preferences could not be saved. Please try again.");
      setMessage({ kind: "error", text });
      toast.error(text);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Section title="Author names" hint="Use your surname and initials, separated by spaces, with no punctuation. One name per line. The system uses these to match publications.">
        <textarea className={`${inputClass} h-auto min-h-24 py-2.5`} value={form.authorAliases} onChange={(e) => setForm({ ...form, authorAliases: e.target.value })} placeholder={"Beridze N\nBeridze Nino"} />
      </Section>

      <Section title="Organisation" hint="Your primary structural unit. It's used for reporting accuracy.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Structural unit">
            <input className={inputClass} value={form.structuralUnit} onChange={(e) => setForm({ ...form, structuralUnit: e.target.value })} />
          </Field>
          <Field label="Sub-unit">
            <input className={inputClass} value={form.subUnit} onChange={(e) => setForm({ ...form, subUnit: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Identifiers" hint="Optional. Used later to match publications automatically.">
        <div className="grid gap-3">
          <Field label="Scopus ID">
            <input className={inputClass} value={form.scopusId} onChange={(e) => setForm({ ...form, scopusId: e.target.value })} />
          </Field>
          <Field label="Web of Science ResearcherID">
            <input className={inputClass} value={form.wosId} onChange={(e) => setForm({ ...form, wosId: e.target.value })} />
          </Field>
          <Field label="ORCID iD">
            <input className={inputClass} value={form.orcidId} onChange={(e) => setForm({ ...form, orcidId: e.target.value })} placeholder="0000-0000-0000-0000" />
          </Field>
        </div>
      </Section>

      <Section title="Search keywords" hint="Keywords used to find publications and people of interest. One per line.">
        <textarea className={`${inputClass} h-auto min-h-20 py-2.5`} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
      </Section>

      <Section title="System language" hint="The language for the system interface. Only the setting is saved for now; the interface text will follow in a later update.">
        <select className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Section>

      <Section title="Alerts and automatic claiming">
        <Toggle label="Receive e-mail alerts" checked={form.receiveAlerts} onChange={(v) => setForm({ ...form, receiveAlerts: v })} />
        <Toggle label="Automatically add publications I claim or enter to my profile" checked={form.autoAddPublications} onChange={(v) => setForm({ ...form, autoAddPublications: v })} />
      </Section>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "rounded-[8px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              : "rounded-[8px] border border-primary/30 bg-accent px-3 py-2 text-sm text-primary"
          }
        >
          {message.kind === "ok" ? "✓ " : ""}{message.text}
        </p>
      )}
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
