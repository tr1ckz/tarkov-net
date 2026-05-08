"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password, inviteCode: inviteCode.trim() || undefined })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Registration failed" }));
        setError(data.error ?? "Registration failed");
        return;
      }

      router.push("/login");
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Display Name"
        autoComplete="nickname"
        required
      />
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        autoComplete="email"
        required
      />
      <Input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <div className="space-y-1">
        <Input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="Invite Code (required unless first user)"
          autoComplete="one-time-code"
        />
        <p className="text-xs text-[#7f7768]">Required for all accounts except the first (admin) account.</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have access? <Link href="/login" className="text-primary hover:underline">Login</Link>
      </p>
    </form>
  );
}
