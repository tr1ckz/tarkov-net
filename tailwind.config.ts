import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    // Override all border radii to 0 — hard-edged tactical aesthetic
    borderRadius: {
      none: "0",
      sm: "0",
      DEFAULT: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "9999px"
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        // Named tactical palette tokens
        "tarkov-bg": "#0e0e0e",
        "tarkov-surface": "#1a1a1a",
        "tarkov-surface-alt": "#151515",
        "tarkov-border": "#2d2d2d",
        "tarkov-gold": "#e2d2af",
        "tarkov-olive": "#49533a",
        "tarkov-olive-light": "#5e6a4b",
        "tarkov-red": "#a32a2a"
      },
      fontFamily: {
        sans: ["Rajdhani", "ui-sans-serif", "system-ui"],
        display: ["Bebas Neue", "Rajdhani", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
