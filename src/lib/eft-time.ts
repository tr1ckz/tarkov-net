const TARKOV_RATIO = 7;

function hoursMs(hours: number) {
  return 1000 * 60 * 60 * hours;
}

export function formatEftClock(date: Date) {
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function realTimeToTarkovTime(now: Date, isPrimaryCycle: boolean) {
  const oneDay = hoursMs(24);
  const russiaOffset = hoursMs(3);
  const cycleOffset = russiaOffset + (isPrimaryCycle ? 0 : hoursMs(12));
  return new Date((cycleOffset + now.getTime() * TARKOV_RATIO) % oneDay);
}

export function getEftDualTime(now = new Date()) {
  const left = realTimeToTarkovTime(now, true);
  const right = realTimeToTarkovTime(now, false);

  return {
    primary: formatEftClock(left),
    secondary: formatEftClock(right)
  };
}
