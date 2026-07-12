"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import initialData from "@/src/data/data.json";
import {
  CLASS_BY_SERIES,
  CLASS_ORDER,
  SERIES_NAMES,
  guessSeries,
} from "@/lib/ships";
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

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export default function UserDetailPage() {
  const params = useParams<{ userName: string }>();
  const userName = decodeURIComponent(params.userName || "");

  const [users, setUsers] = useState<UsersMap>({});
  const [seriesPointsByUser, setSeriesPointsByUser] = useState<SeriesPointsByUserMap>({});
  const [unusedPointsByUser, setUnusedPointsByUser] = useState<UnusedPointsByUserMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fallbackUsers = ((initialData as any).users || {}) as UsersMap;
    setUsers(readLocal(STORAGE_KEY_USERS, fallbackUsers));
    setSeriesPointsByUser(readLocal(STORAGE_KEY_SERIES_POINTS_BY_USER, {}));
    setUnusedPointsByUser(readLocal(STORAGE_KEY_UNUSED_POINTS_BY_USER, {}));

    let alive = true;
    const sync = async () => {
      try {
        const res = await fetch("/api/gas", {
          method: "POST",
          body: JSON.stringify({ action: "export" }),
        });
        const data = await res.json();
        if (!alive || !data?.ok) return;

        if (data.users) {
          setUsers(data.users);
          localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(data.users));
        }
        if (data.seriesPointsByUser) {
          setSeriesPointsByUser(data.seriesPointsByUser);
          localStorage.setItem(
            STORAGE_KEY_SERIES_POINTS_BY_USER,
            JSON.stringify(data.seriesPointsByUser)
          );
        }
        if (data.unusedPointsByUser) {
          setUnusedPointsByUser(data.unusedPointsByUser);
          localStorage.setItem(
            STORAGE_KEY_UNUSED_POINTS_BY_USER,
            JSON.stringify(data.unusedPointsByUser)
          );
        }
      } catch (error) {
        console.error("ユーザーページのデータ更新に失敗しました", error);
      } finally {
        if (alive) setLoading(false);
      }
    };

    sync();
    return () => {
      alive = false;
    };
  }, []);

  const ownedList = users[userName] || [];
  const seriesPoints = seriesPointsByUser[userName] || {};
  const unusedPoints = unusedPointsByUser[userName] || {};
  const exists = Object.prototype.hasOwnProperty.call(users, userName);

  const ownedSeries = useMemo(() => {
    const result = new Set<string>();
    for (const item of ownedList) {
      const series = guessSeries(item.name);
      if (series) result.add(series);
    }
    return result;
  }, [ownedList]);

  const seriesRows = useMemo(() => {
    const allSeries = new Set<string>([
      ...Array.from(ownedSeries),
      ...Object.keys(seriesPoints),
    ]);
    const order = new Map(SERIES_NAMES.map((name, index) => [name, index]));

    return Array.from(allSeries)
      .map((series) => ({
        series,
        pt: seriesPoints[series] ?? 0,
        shipClass: CLASS_BY_SERIES[series] || "未分類",
        owned: ownedSeries.has(series),
      }))
      .sort(
        (a, b) =>
          (order.get(a.series) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.series) ?? Number.MAX_SAFE_INTEGER) ||
          a.series.localeCompare(b.series, "ja")
      );
  }, [ownedSeries, seriesPoints]);

  // 個別ページに表示する設計図:
  // ・所持している
  // ・モジュールではない
  // ・Ptが0でも表示する
  const visibleSeriesRows = useMemo(
    () =>
      seriesRows.filter(
        (row) =>
          row.owned &&
          !row.series.includes("モジュール")
      ),
    [seriesRows]
  );

  const seriesTotal = visibleSeriesRows.reduce((sum, row) => sum + row.pt, 0);
  const unusedTotal = UNUSED_CLASSES.reduce(
    (sum, cls) => sum + (unusedPoints[cls] ?? 0),
    0
  );
  const totalsByClass = calcTotalsByClass(ownedList, seriesPoints, unusedPoints);
  const grandTotal = totalsByClass["総合Pt"] ?? seriesTotal + unusedTotal;

  const classRows = CLASS_ORDER.filter((cls) => cls !== "総合Pt").map((cls) => {
    const blueprintPt = visibleSeriesRows
      .filter((row) => row.shipClass === cls)
      .reduce((sum, row) => sum + row.pt, 0);
    const unusedPt = unusedPoints[cls as UnusedClass] ?? 0;
    const totalPt = totalsByClass[cls] ?? 0;

    return { cls, blueprintPt, unusedPt, totalPt };
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: 16,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <Link href="/ranking" style={navButtonStyle}>ランキングへ戻る</Link>
          <Link href="/" style={navButtonStyle}>ポイント入力ページへ</Link>
        </div>

        <h1 style={{ fontSize: 28, margin: "0 0 6px" }}>{userName}</h1>

        {!exists && !loading ? (
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>ユーザーが見つかりません</h2>
            <p>ユーザー名が変更または削除された可能性があります。</p>
          </section>
        ) : (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <SummaryCard label="総合Pt" value={grandTotal} />
              <SummaryCard label="設計図Pt合計" value={seriesTotal} />
              <SummaryCard label="未使用Pt合計" value={unusedTotal} />
              <SummaryCard label="所持設計図シリーズ" value={visibleSeriesRows.length} suffix="種類" />
            </section>

            <section style={{ ...cardStyle, marginBottom: 16 }}>
              <h2 style={sectionTitleStyle}>ポイント割合</h2>

              <ClassPieChart rows={classRows} grandTotal={grandTotal} />

              <div style={{ overflowX: "auto", marginTop: 18 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "#111827", color: "white" }}>
                      <th style={thStyle}>艦種</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>設計図Pt</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>未使用Pt</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>合計Pt</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>割合</th>
                      <th style={{ ...thStyle, minWidth: 220 }}>比率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map(({ cls, blueprintPt, unusedPt, totalPt }) => {
                      const percent = grandTotal > 0 ? (totalPt / grandTotal) * 100 : 0;
                      return (
                        <tr key={cls} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <td style={{ ...tdStyle, fontWeight: 800 }}>{cls}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{blueprintPt.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{unusedPt.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>
                            {totalPt.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                            {percent.toFixed(1)}%
                          </td>
                          <td style={tdStyle}>
                            <div style={{ height: 14, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${Math.min(100, Math.max(0, percent))}%`,
                                  background: CLASS_COLOR[cls] || "#2563eb",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...cardStyle, marginBottom: 16 }}>
              <h2 style={sectionTitleStyle}>設計図ごとのポイント</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                  <thead>
                    <tr style={{ background: "#111827", color: "white" }}>
                      <th style={thStyle}>設計図シリーズ</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSeriesRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                          設計図データがありません。
                        </td>
                      </tr>
                    ) : (
                      visibleSeriesRows.map((row) => (
                        <tr key={row.series} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <td
                            style={{
                              ...tdStyle,
                              width: 800,
                              fontWeight: 700,
                              background: CLASS_COLOR[row.shipClass] || "#ffffff",
                              color: getReadableTextColor(
                                CLASS_COLOR[row.shipClass] || "#ffffff"
                              ),
                            }}
                          >
                            {row.series}
                          </td>


                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "right",
                              width: 30,
                              fontWeight: 800,
                              background: getBlueprintPtColor(row.pt),
                              color: getBlueprintPtTextColor(row.pt),
                            }}
                          >
                            {row.pt.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>未使用Pt</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 10,
                }}
              >
                {UNUSED_CLASSES.map((cls) => (
                  <div key={cls} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{cls}</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{unusedPoints[cls] ?? 0} Pt</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {formatPercent(unusedPoints[cls] ?? 0, grandTotal)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

type ClassPointRow = {
  cls: string;
  blueprintPt: number;
  unusedPt: number;
  totalPt: number;
};

function ClassPieChart({
  rows,
  grandTotal,
}: {
  rows: ClassPointRow[];
  grandTotal: number;
}) {
  const chartRows = rows.filter((row) => row.totalPt > 0);

  if (grandTotal <= 0 || chartRows.length === 0) {
    return (
      <div
        style={{
          minHeight: 260,
          display: "grid",
          placeItems: "center",
          color: "#6b7280",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
        }}
      >
        円グラフに表示できるポイントがありません。
      </div>
    );
  }

  const width = 520;            // SVGのviewBoxの幅
  const height = 420;         // SVGのviewBoxの高さ 
  const centerX = width / 2;  // 円グラフの中心X座標
  const centerY = 200;        // 円グラフの中心Y座標
  const outerRadius = 130;    // 円グラフの外側の半径
  const innerRadius = 50;     // 円グラフの内側の半径（ドーナツ型にする場合は0より大きくする）
  const insideLabelRadius = 100;
  const outsideStartRadius = 136;
  const outsideBendRadius = 160;
  const outsideTextXOffset = 190;
  const smallSliceThreshold = 24;
  const minimumLabelGap = 30;
  const labelMinY = 36;
  const labelMaxY = 286;

  type Slice = ClassPointRow & {
    startAngle: number;
    endAngle: number;
    midAngle: number;
    angleSize: number;
    percent: number;
    outside: boolean;
    side: "left" | "right";
    targetY: number;
    adjustedY: number;
  };

  let currentAngle = -90;

  const slices: Slice[] = chartRows.map((row) => {
    const angleSize = (row.totalPt / grandTotal) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleSize;
    const midAngle = startAngle + angleSize / 2;
    currentAngle = endAngle;

    const side = Math.cos((midAngle * Math.PI) / 180) >= 0 ? "right" : "left";
    const targetY =
      centerY +
      Math.sin((midAngle * Math.PI) / 180) * outsideBendRadius;

    return {
      ...row,
      startAngle,
      endAngle,
      midAngle,
      angleSize,
      percent: (row.totalPt / grandTotal) * 100,
      outside: angleSize < smallSliceThreshold,
      side,
      targetY,
      adjustedY: targetY,
    };
  });

  const spreadOutsideLabels = (side: "left" | "right") => {
    const labels = slices
      .filter((slice) => slice.outside && slice.side === side)
      .sort((a, b) => a.targetY - b.targetY);

    labels.forEach((label, index) => {
      const previous = labels[index - 1];
      label.adjustedY = Math.max(
        labelMinY,
        previous
          ? previous.adjustedY + minimumLabelGap
          : label.targetY
      );
    });

    if (labels.length > 0) {
      const overflow = labels[labels.length - 1].adjustedY - labelMaxY;
      if (overflow > 0) {
        labels.forEach((label) => {
          label.adjustedY -= overflow;
        });
      }

      for (let index = labels.length - 2; index >= 0; index -= 1) {
        labels[index].adjustedY = Math.min(
          labels[index].adjustedY,
          labels[index + 1].adjustedY - minimumLabelGap
        );
      }

      const underflow = labelMinY - labels[0].adjustedY;
      if (underflow > 0) {
        labels.forEach((label) => {
          label.adjustedY += underflow;
        });
      }
    }
  };

  spreadOutsideLabels("left");
  spreadOutsideLabels("right");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        alignItems: "center",
        gap: 18,
        padding: 14,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "grid", placeItems: "center", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxWidth: 520, overflow: "visible" }}
          role="img"
          aria-label="艦種ごとのポイント割合を示す円グラフ"
        >
          {slices.map((slice) => (
            <path
              key={slice.cls}
              d={describeDonutSlice(
                centerX,
                centerY,
                innerRadius,
                outerRadius,
                slice.startAngle,
                slice.endAngle
              )}
              fill={CLASS_COLOR[slice.cls] || "#2563eb"}
              stroke="#ffffff"
              strokeWidth="2"
            >
              <title>
                {`${slice.cls}: ${slice.totalPt.toLocaleString()} Pt (${slice.percent.toFixed(
                  1
                )}%)`}
              </title>
            </path>
          ))}

          {slices.map((slice) => {
            if (!slice.outside) {
              const labelPoint = polarToCartesian(
                centerX,
                centerY,
                insideLabelRadius,
                slice.midAngle
              );

              return (
                <g key={`inside-label-${slice.cls}`} pointerEvents="none">
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={slice.angleSize < 36 ? "10" : "12"}
                    fontWeight="900"
                    fill={getLabelTextColor(CLASS_COLOR[slice.cls])}
                  >
                    {slice.cls}
                  </text>
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y + 12}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={slice.angleSize < 36 ? "10" : "12"}
                    fontWeight="900"
                    fill={getLabelTextColor(CLASS_COLOR[slice.cls])}
                  >
                    {slice.percent.toFixed(1)}%
                  </text>
                </g>
              );
            }

            const lineStart = polarToCartesian(
              centerX,
              centerY,
              outsideStartRadius,
              slice.midAngle
            );
            const lineBend = polarToCartesian(
              centerX,
              centerY,
              outsideBendRadius,
              slice.midAngle
            );
            const textX =
              slice.side === "right"
                ? centerX + outsideTextXOffset
                : centerX - outsideTextXOffset;
            const lineEndX = textX + (slice.side === "right" ? -8 : 8);
            const anchor = slice.side === "right" ? "start" : "end";

            return (
              <g key={`outside-label-${slice.cls}`} pointerEvents="none">
                <polyline
                  points={`${lineStart.x},${lineStart.y} ${lineBend.x},${lineBend.y} ${lineEndX},${slice.adjustedY}`}
                  fill="none"
                  stroke="#4b5563"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle
                  cx={lineStart.x}
                  cy={lineStart.y}
                  r="2.5"
                  fill={CLASS_COLOR[slice.cls] || "#2563eb"}
                />
                <text
                  x={textX}
                  y={slice.adjustedY - 5}
                  textAnchor={anchor}
                  fontSize="12"
                  fontWeight="900"
                  fill="#111827"
                >
                  {slice.cls}
                </text>
                <text
                  x={textX}
                  y={slice.adjustedY + 11}
                  textAnchor={anchor}
                  fontSize="11"
                  fontWeight="800"
                  fill="#4b5563"
                >
                  {slice.percent.toFixed(1)}%
                </text>
              </g>
            );
          })}

          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius - 1}
            fill="#ffffff"
          />
          <text
            x={centerX}
            y={centerY - 8}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="#6b7280"
          >
            総合Pt
          </text>
          <text
            x={centerX}
            y={centerY + 18}
            textAnchor="middle"
            fontSize="21"
            fontWeight="900"
            fill="#111827"
          >
            {grandTotal.toLocaleString()}
          </text>
        </svg>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 9,
        }}
      >
        {chartRows.map((row) => (
          <div
            key={row.cls}
            style={{
              display: "grid",
              gridTemplateColumns: "14px 1fr auto",
              alignItems: "center",
              gap: 8,
              padding: "8px 9px",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 9,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: CLASS_COLOR[row.cls] || "#2563eb",
              }}
            />
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              {row.cls}
            </span>
            <span style={{ textAlign: "right" }}>
              <span style={{ display: "block", fontWeight: 900 }}>
                {formatPercent(row.totalPt, grandTotal)}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "#6b7280" }}>
                {row.totalPt.toLocaleString()} Pt
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeDonutSlice(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const safeEndAngle =
    endAngle - startAngle >= 360 ? startAngle + 359.999 : endAngle;

  const outerStart = polarToCartesian(
    centerX,
    centerY,
    outerRadius,
    startAngle
  );
  const outerEnd = polarToCartesian(
    centerX,
    centerY,
    outerRadius,
    safeEndAngle
  );
  const innerEnd = polarToCartesian(
    centerX,
    centerY,
    innerRadius,
    safeEndAngle
  );
  const innerStart = polarToCartesian(
    centerX,
    centerY,
    innerRadius,
    startAngle
  );

  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function getLabelTextColor(backgroundColor?: string) {
  if (!backgroundColor) return "#111827";

  const hex = backgroundColor.replace("#", "");
  if (hex.length !== 6) return "#111827";

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance < 145 ? "#ffffff" : "#111827";
}

function getBlueprintPtColor(pt: number) {
  if (pt > 400) return "#9900ff";
  if (pt > 200) return "#e06666";
  if (pt > 100) return "#ffff00";
  if (pt > 50) return "#ffe599";
  return "#ffffff";
}

function getBlueprintPtTextColor(pt: number) {
  if (pt > 400) return "#ffffff";
  return "#111827";
}

function getReadableTextColor(backgroundColor: string) {
  const hex = backgroundColor.replace("#", "");

  if (hex.length !== 6) {
    return "#111827";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance < 145 ? "#ffffff" : "#111827";
}

function SummaryCard({
  label,
  value,
  suffix = "Pt",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>
        {value.toLocaleString()} <span style={{ fontSize: 14 }}>{suffix}</span>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 4px 14px rgba(0,0,0,0.07)",
};

const navButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  background: "#2563eb",
  color: "white",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: "bold",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  marginTop: 0,
  marginBottom: 14,
};

const thStyle: React.CSSProperties = {
  padding: "11px 10px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "11px 10px",
  verticalAlign: "middle",
};