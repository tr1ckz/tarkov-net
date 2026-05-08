export type FreshnessState = {
  label: "Fresh" | "Cooling" | "Stale" | "Unknown";
  tone: string;
  minutesOld: number | null;
};

export type ConfidenceState = {
  label: "High" | "Medium" | "Low";
  tone: string;
};

export function getFreshness(goonsTimestamp: string | null): FreshnessState {
  if (!goonsTimestamp) {
    return { label: "Unknown", tone: "text-[#9a9080]", minutesOld: null };
  }

  const timestamp = new Date(goonsTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return { label: "Unknown", tone: "text-[#9a9080]", minutesOld: null };
  }

  const minutesOld = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 60000));

  if (minutesOld <= 30) {
    return { label: "Fresh", tone: "text-[#5e6a4b]", minutesOld };
  }

  if (minutesOld <= 120) {
    return { label: "Cooling", tone: "text-[#9a8b4f]", minutesOld };
  }

  return { label: "Stale", tone: "text-[#a32a2a]", minutesOld };
}

export function getConfidence(reportCount: number | null, minutesOld: number | null): ConfidenceState {
  const count = reportCount ?? 0;
  let score = count >= 20 ? 3 : count >= 8 ? 2 : count >= 3 ? 1 : 0;

  if (minutesOld !== null && minutesOld > 120) {
    score = Math.max(0, score - 1);
  }

  if (score >= 3) {
    return { label: "High", tone: "text-[#5e6a4b]" };
  }

  if (score >= 1) {
    return { label: "Medium", tone: "text-[#9a8b4f]" };
  }

  return { label: "Low", tone: "text-[#a32a2a]" };
}
