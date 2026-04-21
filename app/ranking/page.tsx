"use client";

import { useEffect, useMemo, useState } from "react";
import initialData from "@/src/data/data.json";
import { CLASS_ORDER } from "@/lib/ships";
import { calcTotalsByClass } from "@/lib/ranking";

type OwnedItem = { name: string; type: string };
type UsersMap = Record<string, OwnedItem[]>;
type SeriesPointsMap = Partial<Record<string, number>>;
type SeriesPointsByUserMap = Record<string, SeriesPointsMap>;

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
type UnusedPointsMap = Partial<Record<UnusedClass, number>>;
type UnusedPointsByUserMap = Record<string, UnusedPointsMap>;

const STORAGE_KEY_USERS = "senryoku_users_local_v1";
const STORAGE_KEY_SERIES_POINTS_BY_USER = "senryoku_series_points_by_user_local_v1";
const STORAGE_KEY_UNUSED_POINTS_BY_USER = "senryoku_unused_points_by_user_local_v1";

const CLASS_COLOR: Record<string, string> = {
  フリゲート: "#9fc5e8",
  駆逐艦: "#ffe599",
  巡洋艦: "#93c47d",
  護送艦: "#c27ba0",
  戦闘機: "#f9cb9c",
  巡洋戦艦: "#3c78d8",
  航空母艦: "#f1c232",
  支援艦: "#cc4125",
  戦艦: "#674ea7",
  総合Pt: "#ff0000",
};

export default function RankingPage() {
  const [users, setUsers] = useState<UsersMap>({});
  const [seriesPointsByUser, setSeriesPointsByUser] = useState<SeriesPointsByUserMap>({});
  const [unusedPointsByUser, setUnusedPointsByUser] = useState<UnusedPointsByUserMap>({});

  useEffect(() => {
    try {
      const savedUsers = localStorage.getItem(STORAGE_KEY_USERS);
      const savedPts = localStorage.getItem(STORAGE_KEY_SERIES_POINTS_BY_USER);
      const savedUnused = localStorage.getItem(STORAGE_KEY_UNUSED_POINTS_BY_USER);

      setUsers(savedUsers ? JSON.parse(savedUsers) : ((initialData as any).users || {}));
      setSeriesPointsByUser(savedPts ? JSON.parse(savedPts) : {});
      setUnusedPointsByUser(savedUnused ? JSON.parse(savedUnused) : {});
    } catch {
      setUsers(((initialData as any).users || {}) as UsersMap);
      setSeriesPointsByUser({});
      setUnusedPointsByUser({});
    }
  }, []);

  const rankingByClass = useMemo(() => {
    const result: Record<string, { user: string; pt: number }[]> = {};

    for (const cls of CLASS_ORDER) {
      const rows = Object.keys(users).map((user) => {
        const ownedList = users[user] || [];
        const seriesPoints = seriesPointsByUser[user] || {};
        const unusedPoints = unusedPointsByUser[user] || {};
        const totals = calcTotalsByClass(ownedList, seriesPoints, unusedPoints);

        return {
          user,
          pt: totals[cls] ?? 0,
        };
      });

      rows.sort((a, b) => b.pt - a.pt || a.user.localeCompare(b.user, "ja"));
      result[cls] = rows;
    }

    return result;
  }, [users, seriesPointsByUser, unusedPointsByUser]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>
          分類別ランキング
        </h1>

        <div style={{ display: "grid", gap: 16 }}>
          {CLASS_ORDER.map((cls) => {
            const dark = ["巡洋戦艦", "支援艦", "戦艦", "総合Pt"].includes(cls);

            return (
              <section
                key={cls}
                style={{
                  background: "white",
                  borderRadius: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: CLASS_COLOR[cls] || "#e5e7eb",
                    color: dark ? "white" : "black",
                    padding: "10px 14px",
                    fontWeight: "bold",
                    fontSize: 18,
                  }}
                >
                  {cls} ランキング
                </div>

                <div style={{ padding: 12 }}>
                  {rankingByClass[cls]?.map((row, index) => (
                    <div
                      key={`${cls}_${row.user}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 8px",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: "bold", marginRight: 8 }}>
                          {index + 1}位
                        </span>
                        <span>{row.user}</span>
                      </div>
                      <div style={{ fontWeight: "bold" }}>{row.pt}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}