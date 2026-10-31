"use client";

import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { messageOf } from "@/lib/cloud-bridge";
import { CloudFrame } from "./CloudFrame";
import { ConnectionBanner } from "./ConnectionBanner";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

type Flow = "signIn" | "signUp";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!clean) return setError("Enter your email address");
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return setError(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
    }
    setBusy(true);
    try {
      await signIn("password", {
        flow,
        email: clean,
        password,
        ...(flow === "signUp" && name.trim() ? { name: name.trim() } : {}),
      });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CloudFrame
      title={flow === "signIn" ? "Sign in" : "Create account"}
      footer={
        <button
          type="button"
          className="font-mono text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink underline"
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {flow === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      }
    >
      {/* noValidate: the handler reports every problem in the styled alert
          below, instead of the browser's native bubbles. */}
      <form
        onSubmit={submit}
        noValidate
        className="space-y-3"
        aria-label={flow === "signIn" ? "Sign in" : "Create account"}
      >
        {flow === "signUp" && (
          <div>
            <Label htmlFor="signin-name">Name</Label>
            <Input id="signin-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <Label htmlFor="signin-password">Password</Label>
          <Input
            id="signin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            required
          />
          {flow === "signUp" && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
              {PASSWORD_MIN}-{PASSWORD_MAX} characters
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="border-[1.5px] border-ink bg-priority-urgent text-paper px-3 py-2 text-xs">
            {error}
          </div>
        )}
        <Button type="submit" variant="accent" disabled={busy} className="w-full justify-center">
          {busy ? "One moment…" : flow === "signIn" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <ConnectionBanner />
    </CloudFrame>
  );
}
