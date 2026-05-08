import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full border border-[#2d2d2d] bg-[#111] px-3 py-2 text-sm text-[#e2d2af] placeholder:text-[#555] focus:border-[#e2d2af] focus-visible:outline-none",
        className
      )}
      {...props}
    />
  );
}
