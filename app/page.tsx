"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import initialData from "@/src/data/data.json";
import {
  ShipType,
  MASTER_ORDER,
  SERIES_NAMES,
  CLASS_ORDER,
  CLASS_BY_SERIES,
  guessSeries,
  classifyByName,
  normalize,
} from "@/lib/ships";

type OwnedItem = { name: string; type: string };
type UsersMap = Record<string, OwnedItem[]>;

// ✅ Ptは「未入力」を許可する
type SeriesPointsMap = Partial<Record<string, number>>;
type SeriesPointsByUserMap = Record<string, SeriesPointsMap>;

// -------------------- 未使用Pt（艦種ごと） --------------------
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

// ✅ 未使用Ptも「未入力」を許可する（空欄表示したいので）
type UnusedPointsMap = Partial<Record<UnusedClass, number>>;
type UnusedPointsByUserMap = Record<string, UnusedPointsMap>;

type ScrollState = {
  winY: number;
  seriesY: number;
  unusedY: number;
  ownedY: number;
};

function loadScrollState(): ScrollState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCROLL_STATE);
    if (!raw) return null;
    return JSON.parse(raw) as ScrollState;
  } catch {
    return null;
  }
}

function saveScrollState(state: ScrollState) {
  try {
    localStorage.setItem(STORAGE_KEY_SCROLL_STATE, JSON.stringify(state));
  } catch {}
}


type UiState = {
  selectedUser: string;
  userQuery: string;
  shipType: ShipType;
  shipQuery: string;
  seriesDraftByUser: Record<string, Record<string, string>>;
  unusedDraftByUser: Record<string, Record<string, string>>;
};

function loadUiState(): UiState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UI_STATE);
    if (!raw) return null;
    return JSON.parse(raw) as UiState;
  } catch {
    return null;
  }
}

function saveUiState(partial: Partial<UiState>) {
  const prev = loadUiState(); // localStorage から読む関数
  const next = { ...prev, ...partial };
  localStorage.setItem("ui_state", JSON.stringify(next));
}




// --------------------
const STORAGE_KEY_USERS = "senryoku_users_local_v1";
const STORAGE_KEY_SERIES_POINTS_BY_USER = "senryoku_series_points_by_user_local_v1";
const STORAGE_KEY_UNUSED_POINTS_BY_USER = "senryoku_unused_points_by_user_local_v1";
const STORAGE_KEY_SELECTED_USER = "senryoku_selected_user_v1";
const STORAGE_KEY_UI_STATE = "senryoku_ui_state_v1";
const STORAGE_KEY_SCROLL_STATE = "senryoku_scroll_state_v1";


function clampInt(v: string) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return n;
}

function emptyUnusedPoints(): UnusedPointsMap {
  // ✅ 初期値は全部「未入力(=undefined)」にして空欄表示
  return {
    フリゲート: undefined,
    駆逐艦: undefined,
    巡洋艦: undefined,
    戦闘機: undefined,
    護送艦: undefined,
    巡洋戦艦: undefined,
    航空母艦: undefined,
    支援艦: undefined,
    戦艦: undefined,
  };
}

export default function Home() {
  const [users, setUsers] = useState<UsersMap>({});
  const [seriesPointsByUser, setSeriesPointsByUser] = useState<SeriesPointsByUserMap>({});
  const [unusedPointsByUser, setUnusedPointsByUser] = useState<UnusedPointsByUserMap>({});
    // 入力中の下書き（未確定）
  const [seriesDraftByUser, setSeriesDraftByUser] = useState<Record<string, Record<string, string>>>({});
  const [unusedDraftByUser, setUnusedDraftByUser] = useState<Record<string, Record<string, string>>>({});

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [newUserName, setNewUserName] = useState<string>("");
  
  const [shipType, setShipType] = useState<ShipType>("全艦船");
  const [userQuery, setUserQuery] = useState<string>("");
  const [shipQuery, setShipQuery] = useState<string>("");

  const refSeriesBox = useRef<HTMLDivElement | null>(null);
  const refUnusedBox = useRef<HTMLDivElement | null>(null);
  const refOwnedBox = useRef<HTMLDivElement | null>(null);

  // ---------- GASへ送る（Nextの /api/gas 経由：CORS回避） ----------
  async function gasPost(payload: Record<string, any>) {
    const res = await fetch("/api/gas", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  async function apiUpsertUnusedPt(userName: string, cls: string, pt: number | null) {
    return await gasPost({
      action: "upsertUnusedPt",
      userName,
      cls,
      pt, // null を送れる
    });
  }


  async function apiUpsertOwn(userName: string, shipName: string, own: boolean) {
    return await gasPost({
      action: "upsertOwn",
      userName,
      shipName,
      own: own ? 1 : 0,
    });
  }

  async function apiUpsertPt(userName: string, series: string, pt: number | null) {
  return await gasPost({
    action: "upsertPt",
    userName,
    series,
    pt, // null を送れる
  });
  }



  async function apiDeleteUser(userName: string) {
    return await gasPost({
      action: "deleteUser",
      userName,
    });
  }

  async function apiCreateUser(userName: string) {
    return await gasPost({
      action: "createUser",
      userName,
    });
  }

  async function apiExport() {
    const res = await fetch("/api/gas", {
      method: "POST",
      body: JSON.stringify({ action: "export" }),
    });
    return await res.json();
  }

  // ---------- 起動時：localStorage（軽い復元） ----------
  useEffect(() => {
    try {
      const savedUsers = localStorage.getItem(STORAGE_KEY_USERS);
      const savedPts = localStorage.getItem(STORAGE_KEY_SERIES_POINTS_BY_USER);
      const savedUnused = localStorage.getItem(STORAGE_KEY_UNUSED_POINTS_BY_USER);

      const u = savedUsers ? (JSON.parse(savedUsers) as UsersMap) : ((initialData as any).users || {});
      const p = savedPts ? (JSON.parse(savedPts) as SeriesPointsByUserMap) : {};
      const un = savedUnused ? (JSON.parse(savedUnused) as UnusedPointsByUserMap) : {};

      setUsers(u || {});
      setSeriesPointsByUser(p || {});
      setUnusedPointsByUser(un || {});
       // ✅ 追加：選択ユーザー復元
      const savedSelected = localStorage.getItem(STORAGE_KEY_SELECTED_USER);
      if (savedSelected) setSelectedUser(savedSelected);
    } catch {
      setUsers(((initialData as any).users || {}) as UsersMap);
      setSeriesPointsByUser({});
      setUnusedPointsByUser({});
    
    }
    const ui = loadUiState();
    if (ui) {
      setSelectedUser(ui.selectedUser || "");
      setUserQuery(ui.userQuery || "");
      setShipType(ui.shipType || "全艦船");
      setShipQuery(ui.shipQuery || "");
      setSeriesDraftByUser(ui.seriesDraftByUser || {});
      setUnusedDraftByUser(ui.unusedDraftByUser || {});
    }


  }, []);
  useEffect(() => {
    if (selectedUser) {
      localStorage.setItem(STORAGE_KEY_SELECTED_USER, selectedUser);
    } else {
      localStorage.removeItem(STORAGE_KEY_SELECTED_USER);
    }
  }, [selectedUser]);
  useEffect(() => {
    saveUiState({
      selectedUser,
      userQuery,
      shipType,
      shipQuery,
      seriesDraftByUser,
      unusedDraftByUser,
    });
  }, [
    selectedUser,
    userQuery,
    shipType,
    shipQuery,
    seriesDraftByUser,
    unusedDraftByUser,
  ]);
  useEffect(() => {
    const handler = () => {
      saveUiState({
        selectedUser,
        userQuery,
        shipType,
        shipQuery,
        seriesDraftByUser,
        unusedDraftByUser,
      });
    };
    window.addEventListener("pagehide", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [selectedUser, userQuery, shipType, shipQuery, seriesDraftByUser, unusedDraftByUser]);

  useEffect(() => {
    let raf = 0;

    const write = () => {
      raf = 0;
      saveScrollState({
        winY: window.scrollY || 0,
        seriesY: refSeriesBox.current?.scrollTop || 0,
        unusedY: refUnusedBox.current?.scrollTop || 0,
        ownedY: refOwnedBox.current?.scrollTop || 0,
      });
    };

    const scheduleWrite = () => {
      if (raf) return;
      raf = requestAnimationFrame(write);
    };

    window.addEventListener("scroll", scheduleWrite, { passive: true });

    const seriesEl = refSeriesBox.current;
    const unusedEl = refUnusedBox.current;
    const ownedEl = refOwnedBox.current;

    seriesEl?.addEventListener("scroll", scheduleWrite, { passive: true });
    unusedEl?.addEventListener("scroll", scheduleWrite, { passive: true });
    ownedEl?.addEventListener("scroll", scheduleWrite, { passive: true });

    // 念のため：画面離脱時も保存
    const onHide = () => scheduleWrite();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("scroll", scheduleWrite);
      seriesEl?.removeEventListener("scroll", scheduleWrite);
      unusedEl?.removeEventListener("scroll", scheduleWrite);
      ownedEl?.removeEventListener("scroll", scheduleWrite);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  useEffect(() => {
    const st = loadScrollState();
    if (!st) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, st.winY || 0);
        if (refSeriesBox.current) refSeriesBox.current.scrollTop = st.seriesY || 0;
        if (refUnusedBox.current) refUnusedBox.current.scrollTop = st.unusedY || 0;
        if (refOwnedBox.current) refOwnedBox.current.scrollTop = st.ownedY || 0;
      });
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      saveUiState({ selectedUser, userQuery, shipType, shipQuery });
    };
    window.addEventListener("pagehide", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [selectedUser, userQuery, shipType, shipQuery]);

  // ---------- 1時間ポーリング：スプシ → アプリ反映 ----------
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const data = await apiExport();
        if (!alive) return;

        if (data && data.ok) {
          // users は普通に上書き（exportが正しい前提）
          if (data.users) setUsers(data.users);

          if (data.seriesPointsByUser) setSeriesPointsByUser(data.seriesPointsByUser);

          if (data.unusedPointsByUser) setUnusedPointsByUser(data.unusedPointsByUser);
        }
      } catch (e) {
        console.error("apiExport failed:", e);
      }
    };

    // 起動直後に1回
    tick();

    // 1時間ごと
    const id = setInterval(tick, 60 * 60 * 1000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ---------- localStorage 保存 ----------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users || {}));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SERIES_POINTS_BY_USER, JSON.stringify(seriesPointsByUser || {}));
  }, [seriesPointsByUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_UNUSED_POINTS_BY_USER, JSON.stringify(unusedPointsByUser || {}));
  }, [unusedPointsByUser]);

  // ✅ 選択中ユーザーのPtマップ
  const seriesPoints: SeriesPointsMap = useMemo(() => {
    if (!selectedUser) return {};
    return seriesPointsByUser[selectedUser] || {};
  }, [seriesPointsByUser, selectedUser]);

  // ✅ 未使用Pt（未設定ならundefined）
  const unusedPoints: UnusedPointsMap = useMemo(() => {
    if (!selectedUser) return emptyUnusedPoints();
    return unusedPointsByUser[selectedUser] || emptyUnusedPoints();
  }, [unusedPointsByUser, selectedUser]);

  // ✅ 表示用ユーザー一覧（検索反映）
  const filteredUserNames: string[] = useMemo(() => {
    const names = Object.keys(users || {}).sort((a, b) => a.localeCompare(b, "ja"));
    const q = userQuery.trim();
    if (!q) return names;
    return names.filter((n) => n.includes(q));
  }, [users, userQuery]);

  const ownedList: OwnedItem[] = useMemo(() => {
    if (!selectedUser) return [];
    return users[selectedUser] || [];
  }, [users, selectedUser]);

  // ✅ 分類ごとの合計Pt（シリーズPt合計 + 未使用Ptを加算）
  const totalsByClass = useMemo(() => {
    const totals: Record<string, number> = {};

    // 「総合Pt」表示にしたいので、CLASS_ORDER の "未分類" を "総合Pt" 表示として使う想定なら
    // ここでは totals のキーはそのままで OK（表示側でラベルを変えてるなら）
    for (const c of CLASS_ORDER) totals[c] = 0;

    if (!selectedUser) return totals;

    // ① シリーズPt（同シリーズ1回）
    const ownedSeries = new Set<string>();
    for (const it of ownedList) {
      const s = guessSeries(it.name);
      if (s) ownedSeries.add(s);
    }

    for (const s of ownedSeries) {
      const cls = CLASS_BY_SERIES[s];
      if (!cls) continue;

      // モジュールは除外
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

    // ② 未使用Ptを各分類に加算（型安全）
    for (const cls of UNUSED_CLASSES) {
      totals[cls] += unusedPoints[cls] ?? 0;
    }

    let grand = 0;

    for (const c of CLASS_ORDER) {
      if (c === "総合Pt") continue; // ← 総合Pt 自身は合算しない
      grand += totals[c] ?? 0;
    }

    totals["総合Pt"] = grand;


    return totals;
  }, [selectedUser, ownedList, seriesPoints, unusedPoints]);

  // ✅ 図鑑（MASTER_ORDER順＋検索＋フィルタ）
  const filteredCatalog: OwnedItem[] = useMemo(() => {
    const map = new Map<string, OwnedItem>();
    for (const u of Object.keys(users || {})) {
      for (const it of users[u] || []) {
        const key = normalize(it.name);
        if (!map.has(key)) map.set(key, { ...it, name: key });
      }
    }

    let list: OwnedItem[] = MASTER_ORDER.map((name) => {
      const key = normalize(name);
      const found = map.get(key);
      return found ? found : { name: key, type: "（データ未登録）" };
    });

    if (shipType !== "全艦船") {
      list = list.filter((x) => {
        const cls = classifyByName(x.name);

        if (shipType === "モジュール") {
          return (
            cls === "巡洋戦艦モジュール" ||
            cls === "航空母艦モジュール" ||
            cls === "支援艦モジュール" ||
            cls === "戦艦モジュール"
          );
        }

        if (shipType === "小型艦") return cls === "フリゲート" || cls === "駆逐艦";
        if (shipType === "艦載機") return cls === "戦闘機";

        return cls === "巡洋艦" || cls === "巡洋戦艦" || cls === "航空母艦" || cls === "支援艦" || cls === "戦艦";
      });
    }

    const q = shipQuery.trim();
    if (q) list = list.filter((x) => x.name.includes(q));

    return list;
  }, [users, shipType, shipQuery]);

  // ---------- ユーザー作成（ローカルも） ----------
  function ensureUser(name: string) {
    const n = name.trim();
    if (!n) return "";

    setUsers((prev) => (prev[n] ? prev : { ...prev, [n]: [] }));
    setSeriesPointsByUser((prev) => (prev[n] ? prev : { ...prev, [n]: {} }));
    setUnusedPointsByUser((prev) => (prev[n] ? prev : { ...prev, [n]: emptyUnusedPoints() }));

    return n;
  }

  // ---------- ユーザー削除 ----------
  async function deleteUser(userName: string) {
    const n = userName.trim();
    if (!n) return;

    setUsers((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });

    setSeriesPointsByUser((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });

    setUnusedPointsByUser((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });

    if (selectedUser === n) setSelectedUser("");

    try {
      await apiDeleteUser(n);
    } catch (e) {
      console.error("deleteUser failed:", e);
    }
  }

  // ---------- 所持判定 ----------
  function isOwned(user: string, shipName: string) {
    const list = users[user] || [];
    const key = normalize(shipName);
    return list.some((x) => normalize(x.name) === key);
  }

  // ---------- 所持トグル ----------
  async function toggleOwned(user: string, item: OwnedItem) {
    const key = normalize(item.name);

    const has = (users[user] || []).some((x) => normalize(x.name) === key);
    const nextOwned = !has;

    setUsers((prev) => {
      const list = prev[user] || [];
      const nextList = has ? list.filter((x) => normalize(x.name) !== key) : [...list, { ...item, name: key }];
      return { ...prev, [user]: nextList };
    });

    try {
      await apiUpsertOwn(user, item.name, nextOwned);
    } catch (e) {
      console.error("GAS同期失敗(own)", e);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f3f4f6", padding: 16 }}>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "white",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>戦力評価アプリ</h1>
        <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>横持ちのほうが入力しやすいです</div>
        {/* 新規ユーザー作成 */}
        <div style={{ marginBottom: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>新しく記入する方はこちらから入力</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="例：ホルンARK"
              style={{ flex: 1, padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
            <button
              onClick={async () => {
                const u = ensureUser(newUserName);
                if (!u) return;

                try {
                  await apiCreateUser(u);
                } catch (e) {
                  console.error("GASユーザー作成失敗", e);
                  alert("スプレッドシート側にユーザー名を書けませんでした（B3:B149が埋まっている可能性）");
                  return;
                }

                setSelectedUser(u);
                setUserQuery(u);
                setNewUserName("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              作成して選択
            </button>
          </div>
        </div>

        {/* ユーザー検索 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#374151" }}>ユーザー検索（プルダウン）</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="名前を入力すると候補が出ます"
              list="userList"
              style={{ flex: 1, padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
            <button
              onClick={() => {
                const q = userQuery.trim();
                if (!q) return;
                const hit = Object.keys(users || {}).find((n) => n === q) || "";
                if (hit) setSelectedUser(hit);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              選択
            </button>
          </div>

          <datalist id="userList">
            {Object.keys(users || {})
              .sort((a, b) => a.localeCompare(b, "ja"))
              .map((name) => (
                <option key={name} value={name} />
              ))}
          </datalist>

          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>ユーザー数：{Object.keys(users || {}).length}人</div>

          {/* 一覧（削除ボタン付き） */}
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {filteredUserNames.map((name) => {
              const active = name === selectedUser;
              return (
                <div
                  key={name}
                  style={{
                    border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: 8,
                    background: active ? "#eff6ff" : "white",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() => setSelectedUser(name)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: active ? "bold" : "normal",
                    }}
                  >
                    {name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {/* ユーザー削除（まとめて） */}
        <div style={{ marginTop: 12, border: "1px solid #fee2e2", borderRadius: 12, padding: 10, background: "#fff1f2" }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8, color: "#991b1b" }}>ユーザー削除</div>

          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            ※ 選択中ユーザーを削除します（所持・Pt・未使用Ptも消えます）
          </div>

          <button
            disabled={!selectedUser}
            onClick={() => {
              if (!selectedUser) return;
              const ok = confirm(`ユーザー「${selectedUser}」を削除しますか？（所持・Pt・未使用Ptも消えます）`);
              if (ok) deleteUser(selectedUser);
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ef4444",
              background: selectedUser ? "#fee2e2" : "#f3f4f6",
              color: selectedUser ? "#991b1b" : "#9ca3af",
              fontWeight: "bold",
              cursor: selectedUser ? "pointer" : "not-allowed",
            }}
          >
            選択中ユーザーを削除
          </button>
        </div>

        {/* 合計 */}
        <div style={{ marginBottom: 12 }}>
          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>ユーザーを選択してください</div>
          ) : (
            <div style={{ fontSize: 14 }}>
              選択中：<b>{selectedUser}</b>
              <div style={{ marginTop: 8, fontSize: 13, color: "#111827" }}>
                <b>分類ごとの合計Pt</b>（未使用Ptを加算 / 未分類は総合Pt）
              </div>

              <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {CLASS_ORDER.map((cls) => (
                  <div
                    key={cls}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      background: "#fafafa",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{cls}</span>
                    
                    <span style={{ fontWeight: 800 }}>{totalsByClass[cls] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* フィルタ */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#374151" }}>艦種フィルタ</label>
          <select
            value={shipType}
            onChange={(e) => setShipType(e.target.value as ShipType)}
            style={{ width: "100%", padding: 10, marginTop: 6, border: "1px solid #d1d5db", borderRadius: 8 }}
          >
            <option>全艦船</option>
            <option>小型艦</option>
            <option>大型艦</option>
            <option>艦載機</option>
            <option>モジュール</option>
          </select>
        </div>

        {/* Pt設定（設計図ごと） */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 6 }}>技術Ptの数を入力（設計図ごと）</div>

          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>まずユーザーを選択してください</div>
          ) : (
            <div ref={refSeriesBox}style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflow: "auto" }}>
              {SERIES_NAMES.map((s) => {
                const saved = seriesPointsByUser[selectedUser]?.[s]; // number | undefined
                const draft = seriesDraftByUser[selectedUser]?.[s];  // string | undefined

                const displayValue =
                  draft !== undefined ? draft : (saved === undefined ? "" : String(saved));

                return (
                  <div
                    key={s}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s}</div>

                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={displayValue}
                      onChange={(e) => {
                        if (!selectedUser) return;
                        const raw = e.target.value; // 空欄もそのまま保持
                        setSeriesDraftByUser((prev) => ({
                          ...prev,
                          [selectedUser]: { ...(prev[selectedUser] || {}), [s]: raw },
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur(); // Enterで確定
                      }}
                      onBlur={async () => {
                        if (!selectedUser) return;

                        const raw = seriesDraftByUser[selectedUser]?.[s];
                        if (raw === undefined) return; // 触ってない

                        // 空欄 → クリア（GASもクリア）
                        if (raw.trim() === "") {
                          setSeriesPointsByUser((prev) => ({
                            ...prev,
                            [selectedUser]: { ...(prev[selectedUser] || {}), [s]: undefined },
                          }));

                          // draft消す
                          setSeriesDraftByUser((prev) => {
                            const next = { ...prev };
                            const u = { ...(next[selectedUser] || {}) };
                            delete u[s];
                            next[selectedUser] = u;
                            return next;
                          });

                          try {
                            await apiUpsertPt(selectedUser, s, null); // ← nullでclear（api側対応必須）
                          } catch (err) {
                            console.error("GAS同期失敗(pt)", err);
                          }
                          return;
                        }

                        const val = clampInt(raw);

                        setSeriesPointsByUser((prev) => ({
                          ...prev,
                          [selectedUser]: { ...(prev[selectedUser] || {}), [s]: val },
                        }));

                        // draft消す
                        setSeriesDraftByUser((prev) => {
                          const next = { ...prev };
                          const u = { ...(next[selectedUser] || {}) };
                          delete u[s];
                          next[selectedUser] = u;
                          return next;
                        });

                        try {
                          await apiUpsertPt(selectedUser, s, val);
                        } catch (err) {
                          console.error("GAS同期失敗(pt)", err);
                        }
                      }}
                      style={{
                        width: 90,
                        padding: 8,
                        border: "1px solid #d1d5db",
                        borderRadius: 10,
                        textAlign: "right",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>





        {/* 未使用Pt（艦種ごと） */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 6 }}>未使用Ptの入力（艦種ごと）</div>

          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>まずユーザーを選択してください</div>
          ) : (
            <div ref={refUnusedBox}style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflow: "auto" }}>
              {UNUSED_CLASSES.map((cls) => {
                const saved = unusedPointsByUser[selectedUser]?.[cls]; // number | undefined
                const draft = unusedDraftByUser[selectedUser]?.[cls];  // string | undefined

                const displayValue =
                  draft !== undefined ? draft : (saved === undefined ? "" : String(saved));

                return (
                  <div
                    key={cls}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{cls}</div>

                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={displayValue}
                      onChange={(e) => {
                        if (!selectedUser) return;
                        const raw = e.target.value; // 空欄も保持
                        setUnusedDraftByUser((prev) => ({
                          ...prev,
                          [selectedUser]: { ...(prev[selectedUser] || {}), [cls]: raw },
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      onBlur={async () => {
                        if (!selectedUser) return;

                        const raw = unusedDraftByUser[selectedUser]?.[cls];
                        if (raw === undefined) return; // 触ってない

                        // 空欄 → クリア（GASもクリア）
                        if (raw.trim() === "") {
                          setUnusedPointsByUser((prev) => ({
                            ...prev,
                            [selectedUser]: { ...(prev[selectedUser] || {}), [cls]: undefined as any },
                          }));

                          // draft消す
                          setUnusedDraftByUser((prev) => {
                            const next = { ...prev };
                            const u = { ...(next[selectedUser] || {}) };
                            delete u[cls];
                            next[selectedUser] = u;
                            return next;
                          });

                          try {
                            await apiUpsertUnusedPt(selectedUser, cls, null); // ← nullでclear（api側対応必須）
                          } catch (err) {
                            console.error("GAS同期失敗(unused)", err);
                          }
                          return;
                        }

                        const val = clampInt(raw);

                        setUnusedPointsByUser((prev) => ({
                          ...prev,
                          [selectedUser]: { ...(prev[selectedUser] || {}), [cls]: val as any },
                        }));

                        // draft消す
                        setUnusedDraftByUser((prev) => {
                          const next = { ...prev };
                          const u = { ...(next[selectedUser] || {}) };
                          delete u[cls];
                          next[selectedUser] = u;
                          return next;
                        });

                        try {
                          await apiUpsertUnusedPt(selectedUser, cls, val);
                        } catch (err) {
                          console.error("GAS同期失敗(unused)", err);
                        }
                      }}
                      style={{
                        width: 90,
                        padding: 8,
                        border: "1px solid #d1d5db",
                        borderRadius: 10,
                        textAlign: "right",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>




        {/* 所持 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 6 }}>所持モデル・モジュール入力（タップで◯を入力）</div>

          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>まずユーザーを選択してください</div>
          ) : (
            <div ref={refOwnedBox}style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, maxHeight: 420, overflow: "auto" }}>
              {filteredCatalog.map((it, idx) => {
                const owned = isOwned(selectedUser, it.name);
                const cls = classifyByName(it.name);
                const series = guessSeries(it.name);
                const pt = series ? (seriesPoints[series] ?? 0) : 0;

                return (
                  <div
                    key={`${it.name}__${idx}`}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {cls} / {series ? `シリーズ:${series} / Pt:${pt}` : "シリーズ未判定 / Pt:0"}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleOwned(selectedUser, it)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        border: owned ? "2px solid #16a34a" : "1px solid #d1d5db",
                        background: owned ? "#dcfce7" : "white",
                        fontSize: 18,
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                      title="所持を切り替え"
                    >
                      {owned ? "◯" : ""}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          ※ スプレッドシートからアプリ側への反映は 1時間に1回です（起動時は即時1回）。<br />
        </div>
      </div>
      {/* バージョン表示 */}
      <div
        style={{
          position: "fixed",
          right: 8,
          bottom: 6,
          fontSize: 11,
          color: "#6b7280",
          userSelect: "none",
        }}
      >
        v1.11
</div>

    </main>
  );
}
