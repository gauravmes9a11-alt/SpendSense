import { useState } from "react";
import { Lock, Mail, ShieldCheck, UserCheck, AlertCircle, Sparkles, ArrowRight, Database } from "lucide-react";
import { useApp } from "../context";
import { Logo } from "../components/Layout";
import { Button, Input } from "../components/ui";

export default function LoginPage() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res.success) {
      setError(res.error || "Authentication failed. Please check your credentials.");
    }
  };

  const fillAndLogin = async (presetEmail: string, roleName: string) => {
    setEmail(presetEmail);
    setPassword("SpendSense@2026");
    setError(null);
    setLoading(true);
    const res = await login(presetEmail, "SpendSense@2026");
    setLoading(false);
    if (!res.success) {
      setError(res.error || `Failed to sign in as ${roleName}.`);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#0B1120] px-4 py-12 text-slate-100 overflow-hidden">
      {/* Background radial glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[140px]" />

      <div className="relative w-full max-w-md">
        {/* Branding Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl border border-line bg-panel p-3 shadow-glow mb-3">
            <Logo size={42} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            SpendSense
          </h1>
          <p className="mt-1 text-sm text-muted">
            Personal Finance, Subscriptions & Vector Intelligence
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-line bg-panel/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 border-b border-line pb-4">
            <h2 className="text-lg font-semibold text-white">Sign In to Continue</h2>
            <p className="text-xs text-muted mt-0.5">
              Access is protected by server-side RBAC and cryptographically signed JWT tokens.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-loss/40 bg-loss/10 p-3 text-xs text-loss">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preset 1-Click Role Login */}
          <div className="mb-6 rounded-xl border border-line/60 bg-ink/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                1-Click Quick Demo Sign In
              </span>
              <span className="flex items-center gap-1 text-[10px] text-accent">
                <Sparkles size={11} /> Verified Roles
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => fillAndLogin("gaurav.demo@example.com", "Admin")}
                className="group flex flex-col justify-between rounded-lg border border-accent/30 bg-accent/10 p-2.5 text-left transition hover:border-accent hover:bg-accent/20 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-accent">
                    <ShieldCheck size={14} /> Admin Portal
                  </span>
                  <ArrowRight size={12} className="text-accent transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-2 text-[11px] text-slate-300 font-medium">Gaurav Demo</div>
                <div className="text-[10px] text-muted">Full Platform + SQL Console</div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => fillAndLogin("harshitha.demo@example.com", "Customer")}
                className="group flex flex-col justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5 text-left transition hover:border-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                    <UserCheck size={14} /> Customer Portal
                  </span>
                  <ArrowRight size={12} className="text-blue-300 transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-2 text-[11px] text-slate-300 font-medium">Harshitha Demo</div>
                <div className="text-[10px] text-muted">Personal Isolated Account</div>
              </button>
            </div>
          </div>

          {/* Manual Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Email Address (Gmail / Account Email)
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. gaurav.demo@example.com"
                  className="pl-9 w-full"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-3 text-slate-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="pl-9 w-full"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full justify-center py-2.5 text-sm font-semibold shadow-glow mt-2"
            >
              {loading ? "Verifying Credentials..." : "Sign In with Authenticated JWT"}
            </Button>
          </form>

          {/* Security details footer */}
          <div className="mt-6 border-t border-line/60 pt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted">
              <Database size={12} className="text-accent" />
              <span>MySQL 8.0 &middot; Bcrypt Hashed &middot; JWT HS256 &middot; RBAC Enforced</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
