import { useState } from "react";
import { LoginForm } from "./LoginForm";
import "./LoginPage.css";

function LoginPage() {
    const [lang, setLang] = useState<'ka' | "en">("ka");
    return (
        <main className="login-page">
            {/* Left brand panel */}
            {/* ───────── Left brand panel ───────── */}
            <section className="login-brand relative flex flex-col justify-between overflow-hidden bg-brand-700 text-white">
                <img
                    src="/ISU_logo_clean.svg"
                    alt=""
                    aria-hidden="true"
                    className="login-seal pointer-events-none absolute z-0"
                />

                <header className="relative z-10 flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="grid size-11 place-items-center rounded-xl bg-white text-body font-medium text-brand-700"
                    >
                        PEA
                    </span>
                    <div>
                        <p className="text-h3">Personnel Evaluation</p>
                        <p className="text-caption text-brand-200">Ilia State University</p>
                    </div>
                </header>

                <div className="login-intro relative z-10 max-w-[480px]">
                    <h1 className="login-title text-display">Your academic record, evaluated clearly.</h1>
                    <p className="mt-4 text-body text-brand-200">
                        Maintain your researcher profile, submit scored evaluation records
                        with evidence, and follow the review in one place.
                    </p>
                </div>

                <ul className="login-features relative z-10">
                    <li>
                        <p className="font-medium">One profile, always current</p>
                        <p className="text-small text-brand-200">Update your personal profile at any time.</p>
                    </li>
                    <li>
                        <p className="font-medium">Evidence-based evaluation</p>
                        <p className="text-small text-brand-200">Attach PDFs or images to every record you submit.</p>
                    </li>
                    <li>
                        <p className="font-medium">Clear deadlines</p>
                        <p className="text-small text-brand-200">Email reminders before the faculty deadline.</p>
                    </li>
                </ul>
            </section>

            {/* Right brand panel */}
            {/* ───────── Right brand panel ───────── */}
            <section className="login-content relative grid place-items-center bg-card">
               <div className="login-language absolute flex gap-0.5 rounded-md bg-muted p-[3px]">
               {(['ka', 'en'] as const).map((l) => (
                   <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                    className={`rounded-sm px-2.5 py-1 text-caption cursor-pointer ${lang === l ? "bg-card text-foreground" : "text-muted-foreground"}`}
                   >
                   {l.toUpperCase()}
                   </button>
               ))}
               </div>
                <LoginForm />
                
            </section>

        </main >
  );
}

export { LoginPage };
