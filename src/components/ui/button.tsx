import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e2d2af] disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-gradient-to-b from-[#5e6a4b] to-[#49533a] text-[#e2d2af] hover:from-[#6a7856] hover:to-[#545f42]",
        variant === "outline" && "border border-[#2d2d2d] bg-transparent text-[#e2d2af] hover:bg-[#5e6a4b] hover:border-[#5e6a4b]",
        variant === "ghost" && "text-[#e2d2af] hover:bg-[#1a1a1a]",
        variant === "destructive" && "bg-[#a32a2a] text-[#e2d2af] hover:bg-[#b83030]",
        className
      )}
      {...props}
    />
  );
}
