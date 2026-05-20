"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import shipZukan from "@/src/data/ship-zukan.json";

type Ship = Record<string, string | number>;
type Detail = Record<string, string | number>;
type Enhancement = Record<string, string | number>;
type ShipGroup = "全艦船" | "小型艦" | "大型艦" | "艦載機" | "モジュール";

const ships = shipZukan.ships as Ship[];
const details = shipZukan.details as Detail[];
const enhancements = shipZukan.enhancements as Enhancement[];

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

function text(v: unknown) {
  if (v === undefined || v === null || v === "") return "-";
  return String(v);
}

function num(v: unknown) {
  if (v === undefined || v === null || v === "") return "-";
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP") : String(v);
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

export default function ShipZukanPage() {
  const [group, setGroup] = useState<ShipGroup>("全艦船");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>(() => makeKey(ships[0]?.["艦船名称"]));

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

  const selectedDetails = useMemo(() => {
    return details.filter((row) => makeKey(row["艦船"]) === currentName);
  }, [currentName]);

  const selectedEnhancements = useMemo(() => {
    return enhancements.filter((row) => makeKey(row["艦船名"]) === currentName);
  }, [currentName]);

  const shipType = makeKey(selectedShip?.["艦船タイプ"]);
  const bgColor = CLASS_COLOR[shipType] || "#ffffff";

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
    ["対艦DPM", num(selectedShip?.["対艦DPM"])],
    ["対空DPM", num(selectedShip?.["対空DPM"])],
    ["攻城DPM", num(selectedShip?.["攻城DPM"])],
    ["HP", num(selectedShip?.["HP"])],
    ["装甲値", num(selectedShip?.["装甲値"])],
    ["シールド値", num(selectedShip?.["シールド値"])],
    ["巡航速度", num(selectedShip?.["巡航速度"])],
    ["ワープ速度", num(selectedShip?.["ワープ速度"])],
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px", gap: 8 }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 12, alignItems: "start" }}>
          <section style={panelStyle}>
            <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>艦船一覧：{filteredShips.length}件</div>
            <div style={{ maxHeight: "72vh", overflow: "auto", display: "grid", gap: 8 }}>
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
            <div style={{ background: bgColor, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <h2 style={{ fontSize: 22, margin: 0, fontWeight: 900 }}>{currentName}</h2>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {text(selectedShip?.["企業"])} / {text(selectedShip?.["艦船タイプ"])} / {text(selectedShip?.["役割"])}
              </div>
            </div>

            <h3 style={sectionTitle}>基本情報</h3>
            <div style={statGrid}>
              {mainStats.map(([k, v]) => <Stat key={k} label={k} value={v} />)}
            </div>

            <h3 style={sectionTitle}>性能</h3>
            <div style={statGrid}>
              {combatStats.map(([k, v]) => <Stat key={k} label={k} value={v} />)}
            </div>

            <h3 style={sectionTitle}>システム・武装詳細</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["分類", "システム名", "型名", "役割", "装備数", "ダメージタイプ", "優先目標", "単発", "攻撃回数", "冷却時間", "対艦DPM", "対空DPM", "攻城DPM"].map((h) => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedDetails.map((row, i) => (
                    <tr key={i}>
                      {["分類", "システム名", "型名", "役割", "装備数", "ダメージタイプ", "優先目標", "単発", "攻撃回数", "冷却時間", "対艦DPM", "対空DPM", "攻城DPM"].map((k) => <Td key={k}>{text(row[k])}</Td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={sectionTitle}>強化情報</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["システム名", "システム名称", "技術Pt", "効果"].map((h) => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedEnhancements.map((row, i) => (
                    <tr key={i}>
                      {["システム名", "システム名称", "技術Pt", "効果"].map((k) => <Td key={k}>{text(row[k])}</Td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fafafa" }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ border: "1px solid #e5e7eb", padding: 8, background: "#f9fafb", whiteSpace: "nowrap", fontSize: 12 }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ border: "1px solid #e5e7eb", padding: 8, whiteSpace: "nowrap", fontSize: 12 }}>{children}</td>;
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

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
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
