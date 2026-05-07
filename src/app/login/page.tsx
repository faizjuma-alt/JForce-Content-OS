import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { ["check-email"]?: string; from?: string; error?: string } }) {
  const checkEmail = searchParams["check-email"] === "1";
  const error = searchParams.error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl brand-grad flex items-center justify-center font-extrabold text-white text-xl">J</div>
          <div>
            <div className="font-extrabold text-lg leading-none">
              <span>JUMIA</span> <span className="text-orange-100">FORCE</span>
            </div>
            <div className="text-xs text-soft">Engine sign-in</div>
          </div>
        </div>

        {checkEmail ? (
          <div className="rounded-lg border border-good/30 bg-good/10 p-4 mb-4 text-sm">
            <div className="font-bold text-good mb-1">Check your email</div>
            We sent you a sign-in link. It expires in 10 minutes.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-bad/30 bg-bad/10 p-4 mb-4 text-sm">
            <div className="font-bold text-bad mb-1">Sign-in failed</div>
            That email isn't on the allowlist. Contact an admin.
          </div>
        ) : null}

        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("nodemailer", {
              email: String(formData.get("email") || ""),
              redirectTo: "/dashboard",
            });
          }}
          className="space-y-3"
        >
          <label className="block text-xs uppercase tracking-wider text-soft">Work email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="you@yourdomain.com"
            className="input"
            autoComplete="email"
            autoFocus
          />
          <button type="submit" className="btn-primary w-full">Send magic link</button>
        </form>

        <p className="text-xs text-soft mt-6 leading-relaxed">
          We use passwordless sign-in. Click the link we email you and you're in. No passwords to leak.
          Only allowlisted addresses can sign in.
        </p>
      </div>
    </div>
  );
}
