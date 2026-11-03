import { useMemo, useState } from "react";
import { signOut } from "@agent-native/core/client";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { APP_TITLE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";

export function meta() {
  return [
    { title: APP_TITLE },
    { name: "description", content: "Evaluate and track personnel records" },
  ];
}

type Status = "draft" | "submitted";

interface Evaluation {
  id: string;
  employeeName: string;
  position: string;
  department: string;
  cycle: string;
  teaching: number;
  research: number;
  service: number;
  comments: string;
  status: Status;
  updatedAt: string;
}

interface FormState {
  employeeName: string;
  position: string;
  department: string;
  cycle: string;
  teaching: number;
  research: number;
  service: number;
  comments: string;
}

const EMPTY_FORM: FormState = {
  employeeName: "",
  position: "",
  department: "",
  cycle: "",
  teaching: 3,
  research: 3,
  service: 3,
  comments: "",
};

const SCORE_FIELDS: { key: "teaching" | "research" | "service"; label: string; hint: string }[] = [
  { key: "teaching", label: "Teaching", hint: "Instruction, mentoring, course quality" },
  { key: "research", label: "Research", hint: "Publications, grants, scholarly output" },
  { key: "service", label: "Service", hint: "Committees, administration, community" },
];

function overall(e: Pick<Evaluation, "teaching" | "research" | "service">) {
  return (e.teaching + e.research + e.service) / 3;
}

function formatScore(n: number) {
  return n.toFixed(1);
}

export default function HomeRoute() {
  const list = useActionQuery("list-evaluations", {});
  const evaluations = (list.data ?? []) as Evaluation[];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => {
    const submitted = evaluations.filter((e) => e.status === "submitted").length;
    const avg =
      evaluations.length === 0
        ? null
        : evaluations.reduce((sum, e) => sum + overall(e), 0) / evaluations.length;
    return { total: evaluations.length, submitted, drafts: evaluations.length - submitted, avg };
  }, [evaluations]);

  const editing = evaluations.find((e) => e.id === editingId) ?? null;
  const showForm = creating || editing !== null;

  return (
    <div className="flex h-full min-h-screen bg-background text-foreground">
      {/* Brand panel: fixed 640px on wide viewports, hidden on narrow ones */}
      <aside className="hidden w-[640px] shrink-0 flex-col justify-between bg-primary p-16 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sm font-semibold text-primary">
            PEA
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-[22px]">Personnel Evaluation</p>
            <p className="text-xs font-medium leading-4 text-[#E9BFC5]">Ilia State University</p>
          </div>
        </div>

        <div>
          <h1 className="text-[32px] font-semibold leading-10 tracking-tight">
            Evaluations, reviewed on time.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-[22px] text-[#E9BFC5]">
            Score teaching, research and service on a five-point scale, keep drafts
            until a cycle closes, and submit when each record is final.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/20 pt-6">
            <Stat label="Records" value={String(stats.total)} />
            <Stat label="Submitted" value={String(stats.submitted)} />
            <Stat label="Average" value={stats.avg === null ? "—" : formatScore(stats.avg)} />
          </dl>
        </div>

        <p className="text-xs text-[#E9BFC5]">Scores run from 0 (none) to 5 (exemplary).</p>
      </aside>

      {/* Work panel */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
              PEA
            </div>
            <p className="text-sm font-semibold">Personnel Evaluation</p>
          </div>
          <h2 className="hidden text-2xl font-semibold tracking-tight lg:block">
            {showForm ? (editing ? "Edit evaluation" : "New evaluation") : "Evaluations"}
          </h2>
          <div className="flex items-center gap-2">
            {showForm ? (
              <Button variant="outline" onClick={() => { setCreating(false); setEditingId(null); }}>
                Back to list
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>New evaluation</Button>
            )}
            <Button variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {showForm ? (
            <EvaluationForm
              key={editing?.id ?? "new"}
              initial={editing}
              onDone={() => { setCreating(false); setEditingId(null); }}
            />
          ) : list.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading evaluations…</p>
          ) : evaluations.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-3">
              {evaluations.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEditingId(e.id)}
                    className="flex w-full items-center justify-between gap-4 rounded-[10px] border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{e.employeeName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[e.position, e.department, e.cycle].filter(Boolean).join(" · ") || "No details yet"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{formatScore(overall(e))}</span>
                        <span className="block text-xs text-muted-foreground">overall</span>
                      </span>
                      <span
                        className={
                          e.status === "submitted"
                            ? "rounded-[8px] border border-primary/30 bg-accent px-2.5 py-1 text-xs font-medium text-primary"
                            : "rounded-[8px] border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {e.status === "submitted" ? "Submitted" : "Draft"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[#E9BFC5]">{label}</dt>
      <dd className="mt-1 text-[32px] font-semibold leading-10 tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-[10px] border border-dashed border-border px-8 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-primary">
        0
      </div>
      <h3 className="text-base font-semibold">No evaluations yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Start your first record. Drafts stay private to you until you submit them.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        Start an evaluation
      </Button>
    </div>
  );
}

function EvaluationForm({
  initial,
  onDone,
}: {
  initial: Evaluation | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          employeeName: initial.employeeName,
          position: initial.position,
          department: initial.department,
          cycle: initial.cycle,
          teaching: initial.teaching,
          research: initial.research,
          service: initial.service,
          comments: initial.comments,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  const create = useActionMutation("create-evaluation");
  const update = useActionMutation("update-evaluation");
  const remove = useActionMutation("delete-evaluation");
  const busy = create.isPending || update.isPending || remove.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (status: Status) => {
    setError(null);
    if (!form.employeeName.trim()) {
      setError("Enter the employee's name before saving.");
      return;
    }
    const payload = { ...form, employeeName: form.employeeName.trim(), status };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, ...payload } as never);
      } else {
        await create.mutateAsync(payload as never);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    }
  };

  const removeRecord = async () => {
    if (!initial) return;
    if (!window.confirm(`Delete the evaluation for ${initial.employeeName}? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync({ id: initial.id } as never);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete. Please try again.");
    }
  };

  const inputClass =
    "h-10 w-full rounded-[8px] border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[12px] border border-border bg-card p-8">
      <h3 className="text-2xl font-semibold leading-8 tracking-tight">
        {initial ? initial.employeeName : "Evaluation details"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Score each area from 0 to 5, then add notes for the review file.
      </p>

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save("draft");
        }}
      >
        <Field label="Employee name">
          <input className={inputClass} value={form.employeeName} onChange={(e) => set("employeeName", e.target.value)} placeholder="Full name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position">
            <input className={inputClass} value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="Associate Professor" />
          </Field>
          <Field label="Department">
            <input className={inputClass} value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="Computer Science" />
          </Field>
        </div>
        <Field label="Evaluation cycle">
          <input className={inputClass} value={form.cycle} onChange={(e) => set("cycle", e.target.value)} placeholder="2026 Spring" />
        </Field>

        <fieldset className="flex flex-col gap-4 rounded-[10px] border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Scores (0–5)</legend>
          {SCORE_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor={f.key} className="text-sm font-medium">{f.label}</label>
                <span className="text-sm font-semibold tabular-nums text-primary">{form[f.key]}</span>
              </div>
              <input
                id={f.key}
                type="range"
                min={0}
                max={5}
                step={1}
                value={form[f.key]}
                onChange={(e) => set(f.key, Number(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
              <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <p className="border-t border-border pt-3 text-sm">
            Overall{" "}
            <span className="font-semibold tabular-nums text-primary">
              {formatScore((form.teaching + form.research + form.service) / 3)}
            </span>
          </p>
        </fieldset>

        <Field label="Notes">
          <textarea
            className={`${inputClass} h-auto min-h-24 py-2.5`}
            value={form.comments}
            onChange={(e) => set("comments", e.target.value)}
            placeholder="Context, achievements and areas to develop"
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-[8px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" disabled={busy} onClick={() => void save("submitted")}>
            {busy ? "Saving…" : "Submit evaluation"}
          </Button>
          <Button type="submit" variant="outline" disabled={busy}>
            Save as draft
          </Button>
          {initial && (
            <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void removeRecord()}>
              Delete record
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
