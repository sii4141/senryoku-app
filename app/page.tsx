"use client";
// npm run dev
// npm.cmd run dev
import { useEffect, useMemo, useState, useRef } from "react";
import initialData from "@/src/data/data.json";
import Link from "next/link";
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

const HERO_SHIP_NAMES = new Set([
  "AC720-エイグラム未名者",
  "星空巡遊者-レンジャー級民用観光船",
]);

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
  巡洋戦艦モジュール: "#6d9eeb",
  航空母艦モジュール: "#ffd966",
  支援艦モジュール: "#dd7e6b",
  戦艦モジュール: "#8e7cc3",
};

const FOLDABLE_MODULE_CLASSES = new Set([
  "巡洋戦艦モジュール",
  "航空母艦モジュール",
  "支援艦モジュール",
  "戦艦モジュール",
]);

const FOLDABLE_MODEL_CLASSES = new Set([
  "フリゲート",
  "駆逐艦",
  "巡洋艦",
  "戦闘機",
  "護送艦",
]);

const FOLDABLE_CAPITAL_CLASSES = new Set([
  "巡洋戦艦",
  "航空母艦",
  "支援艦",
  "戦艦",
]);

const OWNERSHIP_CLASS_ORDER = [
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
type OwnershipClass = (typeof OWNERSHIP_CLASS_ORDER)[number];

// ✅ 未使用Ptも「未入力」を許可する（空欄表示したいので）
type UnusedPointsMap = Partial<Record<UnusedClass, number>>;
type UnusedPointsByUserMap = Record<string, UnusedPointsMap>;

type PendingOwnershipChange = {
  userName: string;
  shipName: string;
  shipType: string;
  series: string;
  own: number;
};

type PendingPointChange =
  | { kind: "series"; userName: string; series: string; pt: number | null }
  | { kind: "unused"; userName: string; cls: UnusedClass; pt: number | null };

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
const OWNERSHIP_SAVE_DELAY_MS = 3_000;
const POINT_SAVE_DELAY_MS = 3_000;


function clampInt(v: string) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return n;
}

function displayOwnedItemName(name: string) {
  if (!FOLDABLE_MODULE_CLASSES.has(classifyByName(name))) return name;
  return name.replace(/\s*[（(][^（）()]+[）)]\s*$/, "");
}

function formatJstTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
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
  const [ownershipSaveStatus, setOwnershipSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [ownershipPendingCount, setOwnershipPendingCount] = useState(0);
  const [pointSaveStatus, setPointSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [pointPendingCount, setPointPendingCount] = useState(0);
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [expandedOwnershipClasses, setExpandedOwnershipClasses] = useState<Partial<Record<OwnershipClass, boolean>>>({});
  const [expandedModuleGroups, setExpandedModuleGroups] = useState<Partial<Record<string, boolean>>>({});
  const refSeriesBox = useRef<HTMLDivElement | null>(null);
  const refUnusedBox = useRef<HTMLDivElement | null>(null);
  const refOwnedBox = useRef<HTMLDivElement | null>(null);
  const pendingOwnershipRef = useRef<Map<string, PendingOwnershipChange>>(new Map());
  const ownershipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownershipSavingRef = useRef(false);
  const pendingPointRef = useRef<Map<string, PendingPointChange>>(new Map());
  const pointSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointSavingRef = useRef(false);

  // +5/-5を連打したときも、Reactの再描画を待たずに最新値を参照するためのref
  const latestSeriesPointsRef = useRef<Record<string, number>>({});
  const latestUnusedPointsRef = useRef<Record<string, number>>({});

  // ---------- GASへ送る（Nextの /api/gas 経由：CORS回避） ----------
  async function gasPost(payload: Record<string, any>) {
    const res = await fetch("/api/gas", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const text = await res.text();

    let result: Record<string, any>;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error("GASからJSON以外の応答が返されました");
    }

    if (!res.ok || result.ok === false) {
      throw new Error(String(result.error || `GASへの保存に失敗しました（${res.status}）`));
    }

    return result;
  }

  // ---------- 操作ログをスプレッドシートへ保存（/api/gas 経由） ----------
  async function apiWriteLog(userName: string, operation: string, detail: string) {
    try {
      const result = await gasPost({
        action: "logAction",
        userName,
        operation,
        detail,
        page: "home",
        timestamp: formatJstTimestamp(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });

      console.log("操作ログ保存結果:", result);
      return result;
    } catch (e) {
      console.error("操作ログ保存失敗:", e);
    }
  }

  async function apiUpsertUnusedPt(userName: string, cls: string, pt: number | null) {
    return await gasPost({
      action: "upsertUnusedPt",
      userName,
      cls,
      pt, // null を送れる
    });
  }


  async function apiUpsertOwn(
    userName: string,
    shipName: string,
    shipType: string,
    series: string,
    own: boolean
  ) {
    const payload = {
      action: "upsertOwn",
      userName,
      shipName,
      shipType,
      series,
      own: own ? 1 : 0,
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await gasPost(payload);
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("所有状態の保存に失敗しました");
  }

  async function apiBatchUpsertOwn(changes: PendingOwnershipChange[]) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await gasPost({ action: "batchUpsertOwn", changes });
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("所有状態の一括保存に失敗しました");
  }

  async function apiBatchUpsertPoints(changes: PendingPointChange[]) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await gasPost({ action: "batchUpsertPoints", changes });
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("ポイントの一括保存に失敗しました");
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

  async function refreshFromSpreadsheet() {
    if (refreshStatus === "loading") return;

    const hasPendingChanges =
      pendingOwnershipRef.current.size > 0 ||
      pendingPointRef.current.size > 0 ||
      ownershipSavingRef.current ||
      pointSavingRef.current;

    if (hasPendingChanges) {
      alert("保存中の変更があります。保存済みになってから更新してください。");
      return;
    }

    setRefreshStatus("loading");
    try {
      const data = await apiExport();
      if (!data?.ok) throw new Error(data?.error || "最新データを取得できませんでした");

      if (data.users) setUsers(data.users);
      if (data.seriesPointsByUser) setSeriesPointsByUser(data.seriesPointsByUser);
      if (data.unusedPointsByUser) setUnusedPointsByUser(data.unusedPointsByUser);
      setRefreshStatus("success");
    } catch (error) {
      console.error("手動更新に失敗:", error);
      setRefreshStatus("error");
    }
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
      setShipType((ui.shipType as string) === "モジュール" ? "全艦船" : (ui.shipType || "全艦船"));
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

  useEffect(() => {
    return () => {
      if (ownershipSaveTimerRef.current) clearTimeout(ownershipSaveTimerRef.current);
      if (pointSaveTimerRef.current) clearTimeout(pointSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      const ownershipIdle = pendingOwnershipRef.current.size === 0 && !ownershipSavingRef.current;
      const pointsIdle = pendingPointRef.current.size === 0 && !pointSavingRef.current;
      if (ownershipIdle && pointsIdle) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

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

  // 入力中は画面に表示されている下書き値を優先する。
  // 保存済みデータだけを参照すると、入力欄と合計Ptの表示が一時的に食い違う。
  const effectiveSeriesPoints: SeriesPointsMap = useMemo(() => {
    const points: SeriesPointsMap = { ...seriesPoints };
    if (!selectedUser) return points;

    for (const [series, raw] of Object.entries(seriesDraftByUser[selectedUser] || {})) {
      if (raw.trim() === "") delete points[series];
      else points[series] = clampInt(raw);
    }
    return points;
  }, [seriesPoints, seriesDraftByUser, selectedUser]);

  const effectiveUnusedPoints: UnusedPointsMap = useMemo(() => {
    const points: UnusedPointsMap = { ...unusedPoints };
    if (!selectedUser) return points;

    for (const [cls, raw] of Object.entries(unusedDraftByUser[selectedUser] || {})) {
      const unusedClass = cls as UnusedClass;
      if (raw.trim() === "") delete points[unusedClass];
      else points[unusedClass] = clampInt(raw);
    }
    return points;
  }, [unusedPoints, unusedDraftByUser, selectedUser]);

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

      totals[cls] += effectiveSeriesPoints[s] ?? 0;
    }

    // ② 未使用Ptを各分類に加算（型安全）
    for (const cls of UNUSED_CLASSES) {
      totals[cls] += effectiveUnusedPoints[cls] ?? 0;
    }

    let grand = 0;

    for (const c of CLASS_ORDER) {
      if (c === "総合Pt") continue; // ← 総合Pt 自身は合算しない
      grand += totals[c] ?? 0;
    }

    totals["総合Pt"] = grand;


    return totals;
  }, [selectedUser, ownedList, effectiveSeriesPoints, effectiveUnusedPoints]);

  // ✅ 図鑑（MASTER_ORDER順）
  const catalog: OwnedItem[] = useMemo(() => {
    const map = new Map<string, OwnedItem>();
    for (const u of Object.keys(users || {})) {
      for (const it of users[u] || []) {
        const key = normalize(it.name);
        if (!map.has(key)) map.set(key, { ...it, name: key });
      }
    }

    return MASTER_ORDER.map((name) => {
      const key = normalize(name);
      const found = map.get(key);
      return found ? found : { name: key, type: "（データ未登録）" };
    });
  }, [users]);

  // ✅ 検索＋フィルタ
  const filteredCatalog: OwnedItem[] = useMemo(() => {
    let list = catalog;

    if (shipType !== "全艦船") {
      list = list.filter((x) => {
        const cls = classifyByName(x.name);

        if (shipType === "小型艦") return cls === "フリゲート" || cls === "駆逐艦";
        if (shipType === "艦載機") return cls === "戦闘機" || cls === "護送艦";

        return cls === "巡洋艦" || cls === "巡洋戦艦" || cls === "航空母艦" || cls === "支援艦" || cls === "戦艦";
      });
    }

    const q = shipQuery.trim();
    if (q) list = list.filter((x) => x.name.includes(q));

    return list;
  }, [catalog, shipType, shipQuery]);

  const ownershipGroups = useMemo(() => {
    const groups = new Map<string, { series: string; mainItems: OwnedItem[]; modules: OwnedItem[]; order: number }>();

    catalog.forEach((item, index) => {
      const cls = classifyByName(item.name);
      const isModel = FOLDABLE_MODEL_CLASSES.has(cls) || FOLDABLE_CAPITAL_CLASSES.has(cls);
      const isModule = FOLDABLE_MODULE_CLASSES.has(cls);
      if (!isModel && !isModule) return;
      const series = guessSeries(item.name);
      if (!series) return;

      const group = groups.get(series) || { series, mainItems: [], modules: [], order: index };
      if (isModule) group.modules.push(item);
      else group.mainItems.push(item);
      group.order = Math.min(group.order, index);
      groups.set(series, group);
    });

    const visibleNames = new Set(filteredCatalog.map((item) => normalize(item.name)));
    return Array.from(groups.values())
      .filter((group) => [...group.mainItems, ...group.modules].some((item) => visibleNames.has(normalize(item.name))))
      .map((group) => ({
        ...group,
        className: (CLASS_BY_SERIES[group.series] || classifyByName(group.mainItems[0]?.name || "")) as OwnershipClass,
      }))
      .sort((a, b) => a.order - b.order);
  }, [catalog, filteredCatalog]);

  const ownershipClassGroups = useMemo(() => {
    return OWNERSHIP_CLASS_ORDER.map((className) => ({
      className,
      groups: ownershipGroups.filter((group) => group.className === className),
    })).filter((entry) => entry.groups.length > 0);
  }, [ownershipGroups]);

  const groupedSeries = useMemo(() => new Set(ownershipGroups.map((group) => group.series)), [ownershipGroups]);

  const regularCatalog = useMemo(
    () => filteredCatalog.filter((item) => {
      return !groupedSeries.has(guessSeries(item.name));
    }),
    [filteredCatalog, groupedSeries]
  );

  // ---------- ユーザー作成（ローカルも） ----------
  function ensureUser(name: string): { user: string; created: boolean } {
    const n = name.trim();
    if (!n) return { user: "", created: false };
  
    const exists = Object.prototype.hasOwnProperty.call(users || {}, n);
  
    // 既存なら state は変えない
    if (exists) return { user: n, created: false };
  
    // 新規だけ追加
    setUsers((prev) => ({ ...prev, [n]: [] }));
    setSeriesPointsByUser((prev) => ({ ...prev, [n]: {} }));
    setUnusedPointsByUser((prev) => ({ ...prev, [n]: emptyUnusedPoints() }));
  
    return { user: n, created: true };
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
      await apiWriteLog(n, "ユーザー削除", `${n} を削除`);
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

  function scheduleOwnershipSave() {
    if (ownershipSaveTimerRef.current) clearTimeout(ownershipSaveTimerRef.current);
    ownershipSaveTimerRef.current = setTimeout(() => {
      void flushOwnershipChanges();
    }, OWNERSHIP_SAVE_DELAY_MS);
  }

  async function flushOwnershipChanges() {
    if (ownershipSavingRef.current) return;

    const entries = Array.from(pendingOwnershipRef.current.entries());
    if (entries.length === 0) return;

    ownershipSaveTimerRef.current = null;
    entries.forEach(([key]) => pendingOwnershipRef.current.delete(key));
    setOwnershipPendingCount(pendingOwnershipRef.current.size);
    ownershipSavingRef.current = true;
    setOwnershipSaveStatus("saving");
    let failed = false;

    try {
      const changes = entries.map(([, change]) => change);
      await apiBatchUpsertOwn(changes);

      const userNames = Array.from(new Set(changes.map((change) => change.userName)));
      await apiWriteLog(
        userNames.length === 1 ? userNames[0] : "複数ユーザー",
        "所有変更",
        [
          `${changes.length}件を一括反映`,
          ...changes.map((change, index) =>
            `${index + 1}. ${change.userName} / ${change.shipName} / ${change.own ? "所有（◯）" : "非所有（-）"}` +
            (change.series ? ` / シリーズ:${change.series}` : "")
          ),
        ].join("\n")
      );
      setOwnershipSaveStatus("saved");
    } catch (error) {
      failed = true;
      entries.forEach(([key, change]) => {
        if (!pendingOwnershipRef.current.has(key)) {
          pendingOwnershipRef.current.set(key, change);
        }
      });
      setOwnershipPendingCount(pendingOwnershipRef.current.size);
      setOwnershipSaveStatus("error");
      console.error("所有状態の一括保存に失敗", error);
      alert("所有変更を保存できませんでした。ページを閉じず、もう一度所有ボタンを操作してください。");
    } finally {
      ownershipSavingRef.current = false;
      if (pendingOwnershipRef.current.size > 0 && !failed) {
        scheduleOwnershipSave();
      }
    }
  }

  function enqueueOwnershipSave(user: string, item: OwnedItem, series: string, nextOwned: boolean) {
    const key = `${user}::${normalize(item.name)}`;
    pendingOwnershipRef.current.set(key, {
      userName: user,
      shipName: item.name,
      shipType: item.type,
      series,
      own: nextOwned ? 1 : 0,
    });
    setOwnershipPendingCount(pendingOwnershipRef.current.size);
    setOwnershipSaveStatus("pending");
    scheduleOwnershipSave();
  }

  // ---------- 所持トグル ----------
  function toggleOwned(user: string, item: OwnedItem) {
    const key = normalize(item.name);
    const currentList = users[user] || [];
    const has = currentList.some((x) => normalize(x.name) === key);
    const nextOwned = !has;
    const series = guessSeries(item.name);
    const alreadyOwnsSeries =
      series !== "" && currentList.some((ownedItem) => guessSeries(ownedItem.name) === series);
    const existingSeriesPt = series !== "" ? seriesPointsByUser[user]?.[series] : undefined;
    const shouldInitializeSeriesPt =
      nextOwned && series !== "" && !alreadyOwnsSeries && existingSeriesPt === undefined;

    setUsers((prev) => {
      const list = prev[user] || [];
      const nextList = has ? list.filter((x) => normalize(x.name) !== key) : [...list, { ...item, name: key }];
      return { ...prev, [user]: nextList };
    });

    if (shouldInitializeSeriesPt) {
      setSeriesPointsByUser((prev) => ({
        ...prev,
        [user]: { ...(prev[user] || {}), [series]: 0 },
      }));

      setSeriesDraftByUser((prev) => {
        const next = { ...prev };
        const userDrafts = { ...(next[user] || {}) };
        delete userDrafts[series];
        next[user] = userDrafts;
        return next;
      });
    }

    enqueueOwnershipSave(user, item, series, nextOwned);

  }

  function scheduleSeriesSave(userName: string, series: string, pt: number | null) {
    pendingPointRef.current.set(`series::${userName}::${series}`, {
      kind: "series",
      userName,
      series,
      pt,
    });
    setPointPendingCount(pendingPointRef.current.size);
    setPointSaveStatus("pending");
    schedulePointSave();
  }

  function scheduleUnusedSave(userName: string, cls: UnusedClass, pt: number | null) {
    pendingPointRef.current.set(`unused::${userName}::${cls}`, {
      kind: "unused",
      userName,
      cls,
      pt,
    });
    setPointPendingCount(pendingPointRef.current.size);
    setPointSaveStatus("pending");
    schedulePointSave();
  }

  function schedulePointSave() {
    if (pointSaveTimerRef.current) clearTimeout(pointSaveTimerRef.current);
    pointSaveTimerRef.current = setTimeout(() => {
      void flushPointChanges();
    }, POINT_SAVE_DELAY_MS);
  }

  async function flushPointChanges() {
    if (pointSavingRef.current) return;

    const entries = Array.from(pendingPointRef.current.entries());
    if (entries.length === 0) return;

    pointSaveTimerRef.current = null;
    entries.forEach(([key]) => pendingPointRef.current.delete(key));
    setPointPendingCount(pendingPointRef.current.size);
    pointSavingRef.current = true;
    setPointSaveStatus("saving");
    let failed = false;

    try {
      const changes = entries.map(([, change]) => change);
      await apiBatchUpsertPoints(changes);

      const userNames = Array.from(new Set(changes.map((change) => change.userName)));
      await apiWriteLog(
        userNames.length === 1 ? userNames[0] : "複数ユーザー",
        "ポイント変更",
        [
          `${changes.length}件を一括反映`,
          ...changes.map((change, index) => {
            const target = change.kind === "series" ? change.series : change.cls;
            const pointType = change.kind === "series" ? "技術Pt" : "未使用Pt";
            const value = change.pt === null ? "空欄（クリア）" : String(change.pt);
            return `${index + 1}. ${change.userName} / ${pointType} / ${target} / ${value}`;
          }),
        ].join("\n")
      );
      setPointSaveStatus("saved");
    } catch (error) {
      failed = true;
      entries.forEach(([key, change]) => {
        if (!pendingPointRef.current.has(key)) {
          pendingPointRef.current.set(key, change);
        }
      });
      setPointPendingCount(pendingPointRef.current.size);
      setPointSaveStatus("error");
      console.error("ポイントの一括保存に失敗", error);
      alert("ポイントを保存できませんでした。ページを閉じず、もう一度入力してください。");
    } finally {
      pointSavingRef.current = false;
      if (pendingPointRef.current.size > 0 && !failed) {
        schedulePointSave();
      }
    }
  }

  function addSeriesPoints(series: string, amount: number) {
    if (!selectedUser) return;

    const userName = selectedUser;
    const key = `${userName}::${series}`;
    const draft = seriesDraftByUser[selectedUser]?.[series];
    const saved = seriesPointsByUser[selectedUser]?.[series];
    const current =
      latestSeriesPointsRef.current[key] ??
      (draft !== undefined && draft.trim() !== "" ? clampInt(draft) : (saved ?? 0));
    const next = Math.max(0, current + amount);

    // 次のクリックからは、再描画前でもこの値を基準に計算できる
    latestSeriesPointsRef.current[key] = next;

    setSeriesPointsByUser((prev) => ({
      ...prev,
      [userName]: { ...(prev[userName] || {}), [series]: next },
    }));
    setSeriesDraftByUser((prev) => {
      const nextDrafts = { ...prev };
      const userDrafts = { ...(nextDrafts[userName] || {}) };
      delete userDrafts[series];
      nextDrafts[userName] = userDrafts;
      return nextDrafts;
    });

    scheduleSeriesSave(userName, series, next);

  }

  function addUnusedPoints(cls: UnusedClass, amount: number) {
    if (!selectedUser) return;

    const userName = selectedUser;
    const key = `${userName}::${cls}`;
    const draft = unusedDraftByUser[selectedUser]?.[cls];
    const saved = unusedPointsByUser[selectedUser]?.[cls];
    const current =
      latestUnusedPointsRef.current[key] ??
      (draft !== undefined && draft.trim() !== "" ? clampInt(draft) : (saved ?? 0));
    const next = Math.max(0, current + amount);

    latestUnusedPointsRef.current[key] = next;

    setUnusedPointsByUser((prev) => ({
      ...prev,
      [userName]: { ...(prev[userName] || {}), [cls]: next },
    }));
    setUnusedDraftByUser((prev) => {
      const nextDrafts = { ...prev };
      const userDrafts = { ...(nextDrafts[userName] || {}) };
      delete userDrafts[cls];
      nextDrafts[userName] = userDrafts;
      return nextDrafts;
    });

    scheduleUnusedSave(userName, cls, next);

  }

  const pointStatusText =
    pointSaveStatus === "pending" ? `保存待ち ${pointPendingCount}件` :
    pointSaveStatus === "saving" ? "保存中…" :
    pointSaveStatus === "saved" ? "保存済み" :
    pointSaveStatus === "error" ? `未保存 ${pointPendingCount}件` : "";

  const totalPendingCount = ownershipPendingCount + pointPendingCount;
  const globalSaveStatus =
    ownershipSaveStatus === "error" || pointSaveStatus === "error" ? "error" :
    ownershipSaveStatus === "saving" || pointSaveStatus === "saving" ? "saving" :
    ownershipSaveStatus === "pending" || pointSaveStatus === "pending" ? "pending" :
    "saved";
  const globalSaveText =
    globalSaveStatus === "error" ? `未保存 ${totalPendingCount}件` :
    globalSaveStatus === "saving" ? (totalPendingCount > 0 ? `保存中…・待ち ${totalPendingCount}件` : "保存中…") :
    globalSaveStatus === "pending" ? `保存待ち ${totalPendingCount}件` :
    "すべて保存済み";

  function ownershipMarker(index: number) {
    let value = index + 1;
    let label = "";

    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }

    return label;
  }

  function modelOwnershipMarker(item: OwnedItem, index: number) {
    return HERO_SHIP_NAMES.has(normalize(item.name)) ? "H" : ownershipMarker(index);
  }

  function moduleOwnershipMarker(item: OwnedItem) {
    return normalize(item.name).match(/^([A-Z]+\d+)-/i)?.[1]?.toUpperCase() || "";
  }

  function renderOwnedItem(item: OwnedItem, itemKey: string) {
    if (!selectedUser) return null;

    const owned = isOwned(selectedUser, item.name);
    const cls = classifyByName(item.name);
    const bgColor = CLASS_COLOR[cls] || "#ffffff";
    const series = guessSeries(item.name);
    const pt = series ? (effectiveSeriesPoints[series] ?? 0) : 0;

    return (
      <div
        key={itemKey}
        className="owned-row"
        style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 8px", marginBottom: 6, border: "1px solid rgba(17, 24, 39, 0.1)", borderRadius: 10, background: bgColor }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{displayOwnedItemName(item.name)}</div>
          <div style={{ fontSize: 12, color: "#000000" }}>
            {cls} / {series ? `シリーズ:${series} / Pt:${pt}` : "シリーズ未判定 / Pt:0"}
          </div>
        </div>

        <button
          className="owned-toggle"
          onClick={() => toggleOwned(selectedUser, item)}
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
  }

  function renderOwnershipSeriesGroup(group: (typeof ownershipGroups)[number]) {
    if (!selectedUser) return null;

    const expanded = Boolean(expandedModuleGroups[group.series]);
    const parentItem = group.mainItems[0];
    const parentClass = parentItem ? classifyByName(parentItem.name) : "未分類";
    const isCapitalGroup = FOLDABLE_CAPITAL_CLASSES.has(parentClass);
    const parentOwned = parentItem ? isOwned(selectedUser, parentItem.name) : false;
    const childItems = isCapitalGroup ? group.modules : group.mainItems;
    const groupLabel = isCapitalGroup && parentItem ? parentItem.name : group.series;
    const childMarkers = childItems
      .map((item, index) => ({
        item,
        marker: isCapitalGroup
          ? moduleOwnershipMarker(item)
          : modelOwnershipMarker(item, index),
        owned: isOwned(selectedUser, item.name),
      }))
      .filter(({ marker }) => marker);
    const capitalMarkerRows = isCapitalGroup
      ? Array.from(
          childMarkers.reduce((rows, entry) => {
            const prefix = entry.marker.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || entry.marker;
            const row = rows.get(prefix) || [];
            row.push(entry);
            rows.set(prefix, row);
            return rows;
          }, new Map<string, typeof childMarkers>())
        )
      : [];

    return (
      <div key={group.series} style={{ marginTop: 6 }}>
        <div
          className={`ownership-series-header${isCapitalGroup ? " is-capital" : ""}`}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: 8,
            border: "1px solid rgba(17, 24, 39, 0.14)",
            borderRadius: 12,
            background: CLASS_COLOR[parentClass] || CLASS_COLOR[classifyByName(childItems[0]?.name || "")] || "#f3f4f6",
            color: "#111827",
          }}
        >
          <button
            className="ownership-series-label"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpandedModuleGroups((previous) => ({
              ...previous,
              [group.series]: !previous[group.series],
            }))}
            style={{
              minWidth: 0,
              flex: 1,
              padding: "8px 6px",
              border: 0,
              background: "transparent",
              color: "inherit",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span aria-hidden="true">{expanded ? "▼" : "▶"}</span>{" "}
            {groupLabel}
          </button>

          {childMarkers.length > 0 && (
            <div
              className="owned-model-markers"
              aria-label={childMarkers
                .map(({ marker, owned }) => `${marker}:${owned ? "所有" : "未所有"}`)
                .join("、")}
              title={childMarkers
                .map(({ item, marker, owned }) => `${marker}: ${displayOwnedItemName(item.name)}（${owned ? "所有" : "未所有"}）`)
                .join("\n")}
            >
              {isCapitalGroup
                ? capitalMarkerRows.map(([prefix, entries]) => (
                    <div className="owned-module-marker-row" key={prefix}>
                      {entries.map(({ item, marker, owned }) => (
                        <span
                          className={`owned-model-marker ${owned ? "is-owned" : "is-unowned"}`}
                          key={item.name}
                          style={{ gridColumn: Number(marker.match(/\d+$/)?.[0] || 1) }}
                        >
                          {marker}
                        </span>
                      ))}
                    </div>
                  ))
                : childMarkers.map(({ item, marker, owned }) => (
                    <span
                      className={`owned-model-marker ${owned ? "is-owned" : "is-unowned"}`}
                      key={item.name}
                    >
                      {marker}
                    </span>
                  ))}
            </div>
          )}

          {renderSeriesPointRow(group.series)}

          {isCapitalGroup && parentItem && (
            <button
              className="owned-toggle"
              onClick={() => toggleOwned(selectedUser, parentItem)}
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 12,
                border: parentOwned ? "2px solid #16a34a" : "1px solid #d1d5db",
                background: parentOwned ? "#dcfce7" : "white",
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
              }}
              title={`${parentItem.name}の所持を切り替え`}
            >
              {parentOwned ? "◯" : ""}
            </button>
          )}
        </div>

        {expanded && (
          <div style={{ marginTop: 6, padding: "6px 6px 0", border: "1px solid rgba(17, 24, 39, 0.14)", borderRadius: 12, background: "rgba(255, 255, 255, 0.5)", overflow: "hidden" }}>
            {childItems.map((item, index) =>
              renderOwnedItem(
                item,
                `${item.name}__${group.series}__${index}`
              )
            )}
          </div>
        )}
      </div>
    );
  }

  function renderSeriesPointRow(series: string) {
    if (!selectedUser) return null;

    const saved = seriesPointsByUser[selectedUser]?.[series];
    const draft = seriesDraftByUser[selectedUser]?.[series];
    const displayValue = draft !== undefined ? draft : (saved === undefined ? "" : String(saved));

    return (
      <div className="point-actions" style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void addSeriesPoints(series, -5)}
            style={{ padding: "8px 9px", border: "1px solid #dc2626", borderRadius: 10, background: "#dc2626", color: "white", fontWeight: 700, cursor: "pointer" }}
            aria-label={`${series}のポイントを5減らす`}
          >
            -5
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={displayValue}
            onChange={(event) => {
              if (!selectedUser) return;
              const raw = event.target.value;
              setSeriesDraftByUser((previous) => ({
                ...previous,
                [selectedUser]: { ...(previous[selectedUser] || {}), [series]: raw },
              }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            onBlur={() => {
              if (!selectedUser) return;
              const userName = selectedUser;
              const raw = seriesDraftByUser[userName]?.[series];
              if (raw === undefined) return;

              if (raw.trim() === "") {
                const key = `${userName}::${series}`;
                latestSeriesPointsRef.current[key] = 0;
                setSeriesPointsByUser((previous) => ({
                  ...previous,
                  [userName]: { ...(previous[userName] || {}), [series]: undefined },
                }));
                setSeriesDraftByUser((previous) => {
                  const next = { ...previous };
                  const userDrafts = { ...(next[userName] || {}) };
                  delete userDrafts[series];
                  next[userName] = userDrafts;
                  return next;
                });
                scheduleSeriesSave(userName, series, null);
                return;
              }

              const value = clampInt(raw);
              const key = `${userName}::${series}`;
              latestSeriesPointsRef.current[key] = value;
              setSeriesPointsByUser((previous) => ({
                ...previous,
                [userName]: { ...(previous[userName] || {}), [series]: value },
              }));
              setSeriesDraftByUser((previous) => {
                const next = { ...previous };
                const userDrafts = { ...(next[userName] || {}) };
                delete userDrafts[series];
                next[userName] = userDrafts;
                return next;
              });
              scheduleSeriesSave(userName, series, value);
            }}
            style={{ width: 48, padding: 8, border: "1px solid #d1d5db", borderRadius: 10, textAlign: "right" }}
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void addSeriesPoints(series, 5)}
            style={{ padding: "8px 9px", border: "1px solid #2563eb", borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 700, cursor: "pointer" }}
            aria-label={`${series}のポイントを5増やす`}
          >
            +5
          </button>
      </div>
    );
  }

  return (
    <main
      className="home-shell"
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "64px 16px 16px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif'
      }}
    >
      <div
        aria-live="polite"
        aria-label={`保存状態: ${globalSaveText}`}
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          minHeight: 38,
          padding: "8px 14px",
          border: globalSaveStatus === "error" ? "1px solid #fca5a5" : globalSaveStatus === "pending" ? "1px solid #fcd34d" : globalSaveStatus === "saving" ? "1px solid #93c5fd" : "1px solid #86efac",
          borderRadius: 999,
          background: globalSaveStatus === "error" ? "#fee2e2" : globalSaveStatus === "pending" ? "#fef3c7" : globalSaveStatus === "saving" ? "#dbeafe" : "#dcfce7",
          color: globalSaveStatus === "error" ? "#991b1b" : globalSaveStatus === "pending" ? "#92400e" : globalSaveStatus === "saving" ? "#1e40af" : "#166534",
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.18)",
          fontSize: 13,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}
      >
        {globalSaveStatus === "saving" && <span className="save-spinner" aria-hidden="true" />}
        <span aria-hidden="true">{globalSaveStatus === "saved" ? "✓" : globalSaveStatus === "error" ? "!" : "●"}</span>
        {globalSaveText}
      </div>
      <div
        className="home-panel"
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          background: "white",
          padding: 16,
          boxSizing: "border-box",
          borderRadius: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        }}
      >
        <header className="home-header">
          <div>
            <h1 className="home-title" style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>戦力評価アプリ</h1>
            <div className="home-kicker" style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>FLEET CAPABILITY CONSOLE · 横持ち推奨</div>
          </div>
        <div
          className="home-nav"
          style={{
            marginBottom: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/ranking"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              background: "#111827",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: "bold",
            }}
          >
            ランキングページへ
          </Link>

          <Link
            href="/ships"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              background: "#2563eb",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: "bold",
            }}
          >
            艦船図鑑ページへ
          </Link>

          <button
            type="button"
            onClick={() => void refreshFromSpreadsheet()}
            disabled={refreshStatus === "loading"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 14px",
              border: "1px solid #0f766e",
              borderRadius: 10,
              background: refreshStatus === "error" ? "#fee2e2" : refreshStatus === "success" ? "#dcfce7" : "#0f766e",
              color: refreshStatus === "error" ? "#991b1b" : refreshStatus === "success" ? "#166534" : "white",
              fontWeight: "bold",
              cursor: refreshStatus === "loading" ? "wait" : "pointer",
            }}
            aria-label="スプレッドシートから最新データを取得"
          >
            {refreshStatus === "loading" && <span className="save-spinner refresh-spinner" aria-hidden="true" />}
            {refreshStatus === "loading" ? "更新中…" : refreshStatus === "success" ? "更新済み" : refreshStatus === "error" ? "更新失敗・再試行" : "最新データに更新"}
          </button>
        </div>
        </header>
        {/* 新規ユーザー作成 */}
        <div className="section-card" style={{ marginBottom: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
          <div className="section-title" style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>新しく記入する方はこちらから入力</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="例：ホルンARK"
              style={{ flex: 1, padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
            <button
              className="primary-action"
              onClick={async () => {
                const { user: u, created } = ensureUser(newUserName);
                if (!u) return;
              
                // ✅ すでに同名がいるなら中断
                if (!created) {
                  alert("そのユーザー名はすでに登録済みです");
                  return;
                }

                // ✅ 新規のときだけGASへ作成
                try {
                  const result = await apiCreateUser(u);

                  if (!result?.ok) {
                    throw new Error(result?.error || "ユーザーを作成できませんでした");
                  }

                  // 別端末などで直前に登録されていた場合も重複として扱う
                  if (result.status === "exists") {
                    alert("そのユーザー名はすでに登録済みです");

                    // 楽観的に追加した空データを、GASの最新データで置き換える
                    const latest = await apiExport();
                    if (latest?.ok) {
                      if (latest.users) setUsers(latest.users);
                      if (latest.seriesPointsByUser) setSeriesPointsByUser(latest.seriesPointsByUser);
                      if (latest.unusedPointsByUser) setUnusedPointsByUser(latest.unusedPointsByUser);
                    }
                    return;
                  }

                  await apiWriteLog(u, "ユーザー作成", `${u} を作成`);
                } catch (e) {
                  console.error("GASユーザー作成失敗", e);
                  alert("スプレッドシート側にユーザー名を書けませんでした（B3:B149が埋まっている可能性）");
              
                  // 失敗したらローカルも戻す（任意だがおすすめ）
                  setUsers((prev) => {
                    const next = { ...prev };
                    delete next[u];
                    return next;
                  });
                  setSeriesPointsByUser((prev) => {
                    const next = { ...prev };
                    delete next[u];
                    return next;
                  });
                  setUnusedPointsByUser((prev) => {
                    const next = { ...prev };
                    delete next[u];
                    return next;
                  });
              
                  return;
                }
              
                // ✅ UI側も選択状態にする
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
        <div className="section-card" style={{ marginBottom: 12 }}>
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
              className="secondary-action"
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
          <div className="user-grid" style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {filteredUserNames.map((name) => {
              const active = name === selectedUser;
              return (
                <div
                  key={name}
                  className={`user-card${active ? " user-card-active" : ""}`}
                  style={{
                    border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: 8,
                    background: active ? "#eff6ff" : "white",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                    minWidth: 0,
                    boxSizing: "border-box",
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
                      color: "#111827",
                      fontWeight: active ? "bold" : "normal",
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {name}
                  </button>
                  <Link
                    href={`/user/${encodeURIComponent(name)}`}
                    style={{
                      padding: "6px 9px",
                      borderRadius: 8,
                      background: "#2563eb",
                      color: "white",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    詳細
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
        {/* ユーザー削除（まとめて） */}
        <div className="section-card danger-card" style={{ marginTop: 12, border: "1px solid #fee2e2", borderRadius: 12, padding: 10, background: "#fff1f2" }}>
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
        <div className="section-card" style={{ marginBottom: 12 }}>
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
                    className="summary-card"
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      background: CLASS_COLOR[cls] || "#fafafa",
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
        <div className="section-card" style={{ marginBottom: 12 }}>
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
          </select>
        </div>







        {/* 所持 */}
        <div className="section-card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <div className="section-title" style={{ fontSize: 14, fontWeight: "bold", marginBottom: 0 }}>技術Pt・所持モデル・モジュール入力</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {ownershipSaveStatus !== "idle" && (
              <div
                aria-live="polite"
                style={{
                  flexShrink: 0,
                  padding: "5px 9px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: ownershipSaveStatus === "error" ? "#991b1b" : "#0d5b69",
                  background: ownershipSaveStatus === "error" ? "#fee2e2" : "#dff3f6",
                }}
              >
                所有: {ownershipSaveStatus === "pending" && `保存待ち ${ownershipPendingCount}件`}
                {ownershipSaveStatus === "saving" && (
                  <><span className="save-spinner" aria-hidden="true" />保存中…</>
                )}
                {ownershipSaveStatus === "saved" && "保存済み"}
                {ownershipSaveStatus === "error" && `未保存 ${ownershipPendingCount}件`}
              </div>
            )}
            {pointStatusText && (
              <div
                aria-live="polite"
                style={{
                  flexShrink: 0,
                  padding: "5px 9px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: pointSaveStatus === "error" ? "#991b1b" : "#0d5b69",
                  background: pointSaveStatus === "error" ? "#fee2e2" : "#dff3f6",
                }}
              >
                Pt: {pointSaveStatus === "saving" && <span className="save-spinner" aria-hidden="true" />}
                {pointStatusText}
              </div>
            )}
            </div>
          </div>

          <div
            role="note"
            style={{
              marginBottom: 8,
              padding: "10px 12px",
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              background: "#eff6ff",
              color: "#1e3a5f",
              fontSize: 12,
              lineHeight: 1.65,
            }}
          >
            <div style={{ fontWeight: 800 }}>入力方法</div>
            <div>① 艦種をタップ → ② シリーズ・親艦をタップ → ③ 設計図・モジュールを表示</div>
            <div>技術Ptはシリーズ・親艦の右側、所有◯は展開後の一覧で入力します。</div>
          </div>

          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>まずユーザーを選択してください</div>
          ) : (
            <div ref={refOwnedBox} className="owned-list" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, maxHeight: 420, overflow: "auto" }}>
              {regularCatalog.map((item, index) =>
                renderOwnedItem(item, `${item.name}__regular__${index}`)
              )}

              {ownershipClassGroups.map(({ className, groups }) => {
                const expanded = Boolean(expandedOwnershipClasses[className]);
                return (
                  <div key={className} style={{ marginTop: 8 }}>
                    <button
                      className="ownership-class-header"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedOwnershipClasses((previous) => ({
                        ...previous,
                        [className]: !previous[className],
                      }))}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "13px 14px",
                        border: "1px solid rgba(17, 24, 39, 0.2)",
                        borderRadius: expanded ? "12px 12px 0 0" : 12,
                        background: CLASS_COLOR[className] || "#e5e7eb",
                        color: "#111827",
                        fontSize: 15,
                        fontWeight: 900,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span><span aria-hidden="true">{expanded ? "▼" : "▶"}</span>{" "}{className}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{groups.length}シリーズ</span>
                    </button>

                    {expanded && (
                      <div style={{ padding: "2px 8px 8px", border: "1px solid rgba(17, 24, 39, 0.2)", borderTop: 0, borderRadius: "0 0 12px 12px" }}>
                        {groups.map((group) => renderOwnershipSeriesGroup(group))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>


        {/* 未使用Pt（艦種ごと） */}
        <div className="section-card" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div className="section-title" style={{ fontSize: 14, fontWeight: "bold", marginBottom: 0 }}>未使用Ptの入力（艦種ごと）</div>
            {pointStatusText && (
              <div
                aria-live="polite"
                style={{
                  flexShrink: 0,
                  padding: "5px 9px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: pointSaveStatus === "error" ? "#991b1b" : "#0d5b69",
                  background: pointSaveStatus === "error" ? "#fee2e2" : "#dff3f6",
                }}
              >
                {pointSaveStatus === "saving" && <span className="save-spinner" aria-hidden="true" />}
                {pointStatusText}
              </div>
            )}
          </div>

          {!selectedUser ? (
            <div style={{ fontSize: 14, color: "#6b7280" }}>まずユーザーを選択してください</div>
          ) : (
            <div ref={refUnusedBox} className="point-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflow: "auto" }}>
              {UNUSED_CLASSES.map((cls) => {
                const bgColor = CLASS_COLOR[cls] || "#ffffff";
                const saved = unusedPointsByUser[selectedUser]?.[cls]; // number | undefined
                const draft = unusedDraftByUser[selectedUser]?.[cls];  // string | undefined

                const displayValue =
                  draft !== undefined ? draft : (saved === undefined ? "" : String(saved));

                return (
                  <div
                    key={cls}
                    className="point-row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: 8,
                      background: bgColor,
                    }}
                  >
                    <div className="point-name" style={{ fontSize: 13, fontWeight: 600 }}>{cls}</div>

                    <div className="point-actions" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void addUnusedPoints(cls, -5)}
                      style={{
                        padding: "8px 9px",
                        border: "1px solid #dc2626",
                        borderRadius: 10,
                        background: "#dc2626",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      aria-label={`${cls}の未使用ポイントを5減らす`}
                    >
                      -5
                    </button>
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
                      onBlur={() => {
                        if (!selectedUser) return;
                        const userName = selectedUser;

                        const raw = unusedDraftByUser[userName]?.[cls];
                        if (raw === undefined) return; // 触ってない

                        // 空欄 → クリア（GASもクリア）
                        if (raw.trim() === "") {
                          const key = `${userName}::${cls}`;
                          latestUnusedPointsRef.current[key] = 0;
                          setUnusedPointsByUser((prev) => ({
                            ...prev,
                            [userName]: { ...(prev[userName] || {}), [cls]: undefined as any },
                          }));

                          // draft消す
                          setUnusedDraftByUser((prev) => {
                            const next = { ...prev };
                            const u = { ...(next[userName] || {}) };
                            delete u[cls];
                            next[userName] = u;
                            return next;
                          });

                          scheduleUnusedSave(userName, cls, null);

                          return;
                        }

                        const val = clampInt(raw);
                        const key = `${userName}::${cls}`;
                        latestUnusedPointsRef.current[key] = val;

                        setUnusedPointsByUser((prev) => ({
                          ...prev,
                          [userName]: { ...(prev[userName] || {}), [cls]: val as any },
                        }));

                        // draft消す
                        setUnusedDraftByUser((prev) => {
                          const next = { ...prev };
                          const u = { ...(next[userName] || {}) };
                          delete u[cls];
                          next[userName] = u;
                          return next;
                        });

                        scheduleUnusedSave(userName, cls, val);

                      }}
                      style={{
                        width: 40,
                        padding: 8,
                        border: "1px solid #d1d5db",
                        borderRadius: 10,
                        textAlign: "right",
                      }}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void addUnusedPoints(cls, 5)}
                      style={{
                        padding: "8px 9px",
                        border: "1px solid #2563eb",
                        borderRadius: 10,
                        background: "#2563eb",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      aria-label={`${cls}の未使用ポイントを5増やす`}
                    >
                      +5
                    </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="sync-note" style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          ※ スプレッドシートからアプリ側への反映は 1時間に1回です（起動時は即時1回）。<br />
        </div>
      </div>
      {/* バージョン表示 */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: 6,
          transform: "translateX(-50%)",
          fontSize: 11,
          color: "#6b7280",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        v1.292
</div>

      <style jsx>{`
        .save-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          margin-right: 6px;
          vertical-align: -2px;
          border: 2px solid rgba(13, 91, 105, 0.25);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: save-spinner-rotate 0.7s linear infinite;
        }

        @keyframes save-spinner-rotate {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 700px) {
          .point-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            max-height: 320px !important;
          }

          .point-row {
            min-width: 0;
          }

          .point-name {
            min-width: 0;
            overflow-wrap: anywhere;
          }

          .point-actions {
            margin-left: auto;
          }
        }
      `}</style>

    </main>
  );
}
