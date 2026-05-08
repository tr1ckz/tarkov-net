"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  signedIn: boolean;
  displayName?: string;
  gameName?: string | null;
  role?: string | null;
};

export function AuthNav({ signedIn, displayName, gameName, role }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login">
          <Button variant="outline">Login</Button>
        </Link>
        <Link href="/register">
          <Button>Create Account</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 border border-[#2d2d2d] bg-[#111] px-3 py-2 text-left text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
        >
          <div className="leading-tight">
            <div className="text-sm">{displayName}</div>
            {gameName ? <div className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">IGN: {gameName}</div> : null}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : "rotate-0"}`} />
        </button>

        {open ? (
          <div className="absolute right-0 z-50 mt-1 w-52 border border-[#2d2d2d] bg-[#111] p-1 shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
            <Link
              href="/profile"
              className="block border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:bg-[#161616] hover:text-[#e2d2af]"
              onClick={() => setOpen(false)}
            >
              Profile Settings
            </Link>
            {role === "ADMIN" && (
              <Link
                href="/admin"
                className="block border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8fa070] hover:border-[#49533a] hover:bg-[#161616] hover:text-[#e2d2af]"
                onClick={() => setOpen(false)}
              >
                Admin Panel
              </Link>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-1 block w-full border border-transparent px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#a32a2a] hover:bg-[#1b1111] hover:text-[#e2d2af]"
            >
              Logout
            </button>
          </div>
        ) : null}
      </div>
      <Link href="/player-stats">
        <Button variant="outline">Player Stats</Button>
      </Link>
    </div>
  );
}
