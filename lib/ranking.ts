import {
  CLASS_ORDER,
  CLASS_BY_SERIES,
  guessSeries,
} from "@/lib/ships";

type OwnedItem = { name: string; type: string };

const UNUSED_CLASSES = [
  "フリゲート",
  "駆逐艦",
  "巡洋艦",
  "戦闘機",
  "護送艦",
  "巡洋戦艦",
  "航空母艦",
  "支援艦",
  "戦艦",
] as const;

type UnusedClass = (typeof UNUSED_CLASSES)[number];
type SeriesPointsMap = Partial<Record<string, number>>;
type UnusedPointsMap = Partial<Record<UnusedClass, number>>;

export function calcTotalsByClass(
  ownedList: OwnedItem[],
  seriesPoints: SeriesPointsMap,
  unusedPoints: UnusedPointsMap
) {
  const totals: Record<string, number> = {};

  for (const c of CLASS_ORDER) totals[c] = 0;

  const ownedSeries = new Set<string>();
  for (const it of ownedList) {
    const s = guessSeries(it.name);
    if (s) ownedSeries.add(s);
  }

  for (const s of ownedSeries) {
    const cls = CLASS_BY_SERIES[s];
    if (!cls) continue;

    if (
      cls === "巡洋戦艦モジュール" ||
      cls === "航空母艦モジュール" ||
      cls === "支援艦モジュール" ||
      cls === "戦艦モジュール"
    ) {
      continue;
    }

    totals[cls] += seriesPoints[s] ?? 0;
  }

  for (const cls of UNUSED_CLASSES) {
    totals[cls] += unusedPoints[cls] ?? 0;
  }

  let grand = 0;
  for (const c of CLASS_ORDER) {
    if (c === "総合Pt") continue;
    grand += totals[c] ?? 0;
  }
  totals["総合Pt"] = grand;

  return totals;
}