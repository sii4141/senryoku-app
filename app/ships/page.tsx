"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import shipZukan from "@/src/data/ship-zukan.json";
import shipImageMap from "@/src/data/ship-image-map.json";

type Ship = Record<string, string | number>;
type Detail = Record<string, string | number>;
type Enhancement = Record<string, string | number>;
type ShipGroup = "全艦船" | "小型艦" | "大型艦" | "艦載機" | "モジュール";

type AppliedStats = {
  antiShipDpm: number;
  antiAirDpm: number;
  siegeDpm: number;
  hp: number;
  armor: number;
  shield: number;
  cruise: number;
  warp: number;
  checkedCount: number;
  totalTp: number;
};

const data = shipZukan as unknown as {
  ships: Ship[];
  details: Detail[];
  enhancements: Enhancement[];
};

const ships = data.ships ?? [];
const details = data.details ?? [];
const enhancements = data.enhancements ?? [];

const SHIP_IMAGE_MAP = shipImageMap as unknown as Record<string, string>;

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
};

const CLASSIFICATION_ICON: Record<string, string> = {
  M武装: "/icons/M_weapon.png",
  武装: "/icons/weapon.png",
  M装甲: "/icons/M_armor.png",
  装甲: "/icons/armor.png",
  動力: "/icons/engine.png",
  M指令: "/icons/M_command.png",
  指令: "/icons/command.png",
  M補修: "/icons/M_repair.png",
  補修: "/icons/repair.png",
  M艦載機: "/icons/M_fighter.png",
  艦載機: "/icons/fighter.png",
  Mエネルギー: "/icons/M_energy.png",
  エネルギー: "/icons/energy.png",
};

function text(v: unknown) {
  if (v === undefined || v === null || v === "") return "-";
  return String(v);
}

function toNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function num(v: unknown) {
  if (v === undefined || v === null || v === "") return "-";
  const n = toNumber(v);
  if (!Number.isFinite(n)) return String(v);
  return Math.round(n).toLocaleString("ja-JP");
}

function percent(v: unknown) {
  const n = toNumber(v);
  if (!n) return "";
  if (Math.abs(n) < 1) return `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
  return `${n > 0 ? "+" : ""}${n}`;
}

function matchesGroup(shipType: string, group: ShipGroup) {
  if (group === "全艦船") return true;
  if (group === "小型艦") return shipType === "フリゲート" || shipType === "駆逐艦";
  if (group === "大型艦") return ["巡洋艦", "巡洋戦艦", "航空母艦", "支援艦", "戦艦"].includes(shipType);
  if (group === "艦載機") return shipType === "戦闘機" || shipType === "護送艦";
  if (group === "モジュール") return shipType.includes("モジュール");
  return true;
}

function makeKey(v: unknown) {
  return String(v ?? "").trim();
}

function enhancementKey(row: Enhancement, index: number) {
  return [
    makeKey(row["艦船名"]),
    makeKey(row["分類"]),
    makeKey(row["システム名"]),
    makeKey(row["システム名称"]),
    makeKey(row["効果"]),
    index,
  ].join("__");
}

function calcAppliedStats(ship: Ship | undefined, checkedEnhancements: Enhancement[]): AppliedStats {
  const baseAntiShip = toNumber(ship?.["対艦DPM"]);
  const baseAntiAir = toNumber(ship?.["対空DPM"]);
  const baseSiege = toNumber(ship?.["攻城DPM"]);
  const baseHp = toNumber(ship?.["HP"]);
  const baseArmor = toNumber(ship?.["装甲値"]);
  const baseShield = toNumber(ship?.["シールド値"]);
  const baseCruise = toNumber(ship?.["巡航速度"]);
  const baseWarp = toNumber(ship?.["ワープ速度"]);

  let damageMul = 1;
  let antiAirMul = 1;
  let siegeMul = 1;
  let cooldownMul = 1;
  let hpMul = 1;
  let armorAdd = 0;
  let shieldMul = 1;
  let cruiseMul = 1;
  let warpMul = 1;
  let totalTp = 0;

  for (const row of checkedEnhancements) {
    const tp = toNumber(row["技術Pt"]);
    if (tp > 0) totalTp += tp;

    const single = toNumber(row["単発"]);
    if (single) damageMul *= 1 + single;

    const aa = toNumber(row["対空ダメージ"]);
    if (aa) antiAirMul *= 1 + aa;

    const siege = toNumber(row["攻城ダメージ"]);
    if (siege) siegeMul *= 1 + siege;

    const cooldown = toNumber(row["冷却"]);
    if (cooldown) {
      // 冷却+10% は攻撃間隔10%短縮としてDPMを 1 / (1 - 0.10) 倍にする。
      // 負値は逆にDPM低下として扱う。
      cooldownMul *= 1 / Math.max(0.05, 1 - cooldown);
    }

    const hp = toNumber(row["HP"]);
    if (hp) hpMul *= 1 + hp;

    const armor = toNumber(row["装甲"]);
    if (armor) armorAdd += armor;

    const shield = toNumber(row["シールド"]);
    if (shield) shieldMul *= 1 + shield;

    const cruise = toNumber(row["巡航速度"]);
    if (cruise) cruiseMul *= 1 + cruise;

    const warp = toNumber(row["ワープ速度"]);
    if (warp) warpMul *= 1 + warp;
  }

  return {
    antiShipDpm: baseAntiShip * damageMul * cooldownMul,
    antiAirDpm: baseAntiAir * damageMul * antiAirMul * cooldownMul,
    siegeDpm: baseSiege * damageMul * siegeMul * cooldownMul,
    hp: baseHp * hpMul,
    armor: baseArmor + armorAdd,
    shield: baseShield * shieldMul,
    cruise: baseCruise * cruiseMul,
    warp: baseWarp * warpMul,
    checkedCount: checkedEnhancements.length,
    totalTp,
  };
}

export default function ShipZukanPage() {
  const [group, setGroup] = useState<ShipGroup>("全艦船");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>(() => makeKey(ships[0]?.["艦船名称"]));
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});

  const filteredShips = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ships.filter((ship) => {
      const shipType = makeKey(ship["艦船タイプ"]);
      if (!matchesGroup(shipType, group)) return false;
      if (!q) return true;
      return ["艦船名称", "企業", "艦船タイプ", "役割", "列", "ダメージタイプ", "武装"]
        .map((k) => makeKey(ship[k]).toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [group, query]);

  const selectedShip = useMemo(() => {
    return ships.find((ship) => makeKey(ship["艦船名称"]) === selectedName) ?? filteredShips[0] ?? ships[0];
  }, [selectedName, filteredShips]);

  const currentName = makeKey(selectedShip?.["艦船名称"]);

  useEffect(() => {
    // 艦船を切り替えたら、前の艦船のチェック状態をクリアする。
    setCheckedMap({});
  }, [currentName]);

  const selectedDetails = useMemo(() => {
    return details.filter((row) => makeKey(row["艦船"]) === currentName);
  }, [currentName]);

  const selectedEnhancements = useMemo(() => {
    return enhancements.filter((row) => makeKey(row["艦船名"]) === currentName);
  }, [currentName]);

  const checkedEnhancements = useMemo(() => {
    return selectedEnhancements.filter((row, i) => checkedMap[enhancementKey(row, i)]);
  }, [selectedEnhancements, checkedMap]);

  const applied = useMemo(() => calcAppliedStats(selectedShip, checkedEnhancements), [selectedShip, checkedEnhancements]);

  const shipType = makeKey(selectedShip?.["艦船タイプ"]);
  const bgColor = CLASS_COLOR[shipType] || "#ffffff";
  const shipImagePath = SHIP_IMAGE_MAP[currentName];

  const mainStats = [
    ["企業", text(selectedShip?.["企業"])],
    ["艦船タイプ", text(selectedShip?.["艦船タイプ"])],
    ["役割", text(selectedShip?.["役割"])],
    ["列", text(selectedShip?.["列"])],
    ["ダメージタイプ", text(selectedShip?.["ダメージタイプ"])],
    ["武装", text(selectedShip?.["武装"])],
    ["指令Pt", num(selectedShip?.["指令Pt"])],
    ["稼働上限", num(selectedShip?.["稼働上限"])],
    ["最大TP", num(selectedShip?.["最大TP"])],
  ];

  const combatStats = [
    ["対艦DPM", num(applied.antiShipDpm), num(selectedShip?.["対艦DPM"])],
    ["対空DPM", num(applied.antiAirDpm), num(selectedShip?.["対空DPM"])],
    ["攻城DPM", num(applied.siegeDpm), num(selectedShip?.["攻城DPM"])],
    ["HP", num(applied.hp), num(selectedShip?.["HP"])],
    ["装甲値", num(applied.armor), num(selectedShip?.["装甲値"])],
    ["シールド値", num(applied.shield), num(selectedShip?.["シールド値"])],
    ["巡航速度", num(applied.cruise), num(selectedShip?.["巡航速度"])],
    ["ワープ速度", num(applied.warp), num(selectedShip?.["ワープ速度"])],
  ];

  const allChecked = selectedEnhancements.length > 0 && selectedEnhancements.every((row, i) => checkedMap[enhancementKey(row, i)]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
      }}
    >
      <div style={{ width: "100%", maxWidth: "none", margin: 0 }}>
        <div
          style={{
            background: "white",
            padding: 16,
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            marginBottom: 12,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 12 }}>艦船図鑑</h1>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Link href="/" style={navButton("#111827")}>ポイント入力ページへ戻る</Link>
            <Link href="/ranking" style={navButton("#2563eb")}>ランキングページへ</Link>
          </div>

          <div className="ship-search" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px", gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="艦船名・企業・役割・武装で検索"
              style={inputStyle}
            />
            <select value={group} onChange={(e) => setGroup(e.target.value as ShipGroup)} style={inputStyle}>
              <option>全艦船</option>
              <option>小型艦</option>
              <option>大型艦</option>
              <option>艦載機</option>
              <option>モジュール</option>
            </select>
          </div>
        </div>

        <div className="ship-layout" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
          <section style={panelStyle}>
            <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>艦船一覧：{filteredShips.length}件</div>
            <div className="ship-list" style={{ maxHeight: "72vh", overflow: "auto", display: "grid", gap: 8 }}>
              {filteredShips.map((ship) => {
                const name = makeKey(ship["艦船名称"]);
                const type = makeKey(ship["艦船タイプ"]);
                const active = name === currentName;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedName(name)}
                    style={{
                      textAlign: "left",
                      border: active ? "2px solid #111827" : "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      background: CLASS_COLOR[type] || "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{name}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{type} / {text(ship["企業"])} / {text(ship["役割"])}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={panelStyle}>
            <div
              style={{
                background: bgColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                display: "grid",
                gridTemplateColumns: shipImagePath ? "420px minmax(0, 1fr)" : "1fr",
                gap: 14,
                alignItems: "center",
              }}
              className="ship-header"
            >
              {shipImagePath ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 9",
                    background: "rgba(255,255,255,0.45)",
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  <Image
                    src={shipImagePath}
                    alt={currentName}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    style={{ objectFit: "contain", padding: 0 }}
                    priority={false}
                  />
                </div>
              ) : null}

              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 22, margin: 0, fontWeight: 900 }}>{currentName}</h2>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  {text(selectedShip?.["企業"])} / {text(selectedShip?.["艦船タイプ"])} / {text(selectedShip?.["役割"])}
                </div>
              </div>
            </div>

            <h3 style={sectionTitle}>基本情報</h3>
            <div className="stat-grid" style={statGrid}>
              {mainStats.map(([k, v]) => <Stat key={k} label={k} value={v} />)}
            </div>

            <h3 style={sectionTitle}>性能（チェックした強化を反映）</h3>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              選択中の強化：{applied.checkedCount}件 / 消費TP：{applied.totalTp}。下段の「基本値」は強化前の値です。
            </div>
            <div className="stat-grid" style={statGrid}>
              {combatStats.map(([k, v, base]) => <Stat key={k} label={k} value={v} sub={`基本値：${base}`} />)}
            </div>

            <h3 style={sectionTitle}>システム・武装詳細</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th compact>分類</Th>
                    {["システム名", "型名", "役割", "装備数", "ダメージタイプ", "優先目標", "単発", "攻撃回数", "冷却時間", "対艦DPM", "対空DPM", "攻城DPM"].map((h) => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedDetails.map((row, i) => (
                    <tr key={i}>
                      <Td compact>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                          <Image
                            src={CLASSIFICATION_ICON[String(row["分類"] ?? "")] || "/icons/unknown.png"}
                            alt={String(row["分類"] ?? "")}
                            width={24}
                            height={24}
                            title={String(row["分類"] ?? "")}
                          />
                        </div>
                      </Td>
                      {["システム名", "型名", "役割", "装備数", "ダメージタイプ", "優先目標", "単発", "攻撃回数", "冷却時間", "対艦DPM", "対空DPM", "攻城DPM"].map((k) => (
                        <Td key={k}>{text(row[k])}</Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={sectionTitle}>強化情報</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  if (!allChecked) selectedEnhancements.forEach((row, i) => { next[enhancementKey(row, i)] = true; });
                  setCheckedMap(next);
                }}
                style={smallButton("#111827")}
              >
                {allChecked ? "全チェック解除" : "全強化をチェック"}
              </button>
              <button onClick={() => setCheckedMap({})} style={smallButton("#6b7280")}>チェックをリセット</button>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              チェックした強化の「単発・冷却・HP・装甲・シールド・巡航速度・ワープ速度・攻城ダメージ・対空ダメージ」を上の性能欄へ反映します。
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>反映</Th>
                    <Th compact>分類</Th>
                    {["システム名", "システム名称", "技術Pt", "効果"].map((h) => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedEnhancements.map((row, i) => {
                    const key = enhancementKey(row, i);
                    const checked = !!checkedMap[key];
                    return (
                      <tr key={key} style={{ background: checked ? "#ecfdf5" : "white" }}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setCheckedMap((prev) => ({ ...prev, [key]: e.target.checked }))}
                          />
                        </Td>
                        <Td compact>
                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                            <Image
                              src={CLASSIFICATION_ICON[String(row["分類"] ?? "")] || "/icons/unknown.png"}
                              alt={String(row["分類"] ?? "")}
                              width={24}
                              height={24}
                              title={String(row["分類"] ?? "")}
                            />
                          </div>
                        </Td>
                        <Td>{text(row["システム名"])}</Td>
                        <Td>{text(row["システム名称"])}</Td>
                        <Td>{text(row["技術Pt"])}</Td>
                        <Td>{text(row["効果"])}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          main {
            padding: 4px !important;
          }

          .ship-layout {
            grid-template-columns: 1fr !important;
          }

          .ship-list {
            max-height: 260px !important;
          }

          .ship-search {
            grid-template-columns: 1fr !important;
          }

          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .ship-header {
            grid-template-columns: 1fr !important;
          }

          table {
            font-size: 11px;
          }
        }
      `}</style>

    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fafafa" }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function Th({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <th
      style={{
        border: "1px solid #e5e7eb",
        padding: compact ? "4px 6px" : 8,
        background: "#f9fafb",
        whiteSpace: "nowrap",
        fontSize: 12,
        width: compact ? 40 : "auto",
        minWidth: compact ? 40 : undefined,
        textAlign: "center",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <td
      style={{
        border: "1px solid #e5e7eb",
        padding: compact ? "4px 6px" : 8,
        whiteSpace: "nowrap",
        fontSize: 12,
        width: compact ? 40 : "auto",
        minWidth: compact ? 40 : undefined,
        textAlign: compact ? "center" : "left",
      }}
    >
      {children}
    </td>
  );
}

function navButton(bg: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    background: bg,
    color: "white",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: "bold",
  };
}

function smallButton(bg: string): React.CSSProperties {
  return {
    padding: "8px 10px",
    background: bg,
    color: "white",
    borderRadius: 8,
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  };
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 10,
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  minWidth: 0,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  marginTop: 18,
  marginBottom: 8,
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};
