"use client";

import { useState } from "react";
import Link from "next/link";

export default function LogsPage() {
  const [password, setPassword] = useState("");
  const [logText, setLogText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/log?password=${encodeURIComponent(password)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage("パスワードが違うか、操作履歴を読み込めませんでした。");
        setLogText("");
        return;
      }
      setLogText(data.text || "");
      if (!data.text) setMessage("操作履歴はまだありません。");
    } catch (e) {
      console.error(e);
      setMessage("操作履歴を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function clearLogs() {
    const ok = confirm("操作履歴をすべて削除しますか？");
    if (!ok) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/log?password=${encodeURIComponent(password)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage("パスワードが違うか、削除できませんでした。");
        return;
      }
      setLogText("");
      setMessage("操作履歴を削除しました。");
    } catch (e) {
      console.error(e);
      setMessage("操作履歴を削除できませんでした。");
    } finally {
      setLoading(false);
    }
  }

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
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "white",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>操作履歴</h1>

        <div style={{ marginBottom: 12 }}>
          <Link
            href="/"
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
            戦力評価ページへ戻る
          </Link>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>管理用パスワード</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="初期値: senryoku"
              style={{ flex: 1, minWidth: 220, padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
            <button
              onClick={loadLogs}
              disabled={loading}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: "bold",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              読み込み
            </button>
            <button
              onClick={clearLogs}
              disabled={loading}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ef4444",
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: "bold",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              履歴を削除
            </button>
          </div>
        </div>

        {message && <div style={{ marginBottom: 12, fontSize: 13, color: "#374151" }}>{message}</div>}

        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#111827",
            color: "#f9fafb",
            padding: 12,
            borderRadius: 12,
            minHeight: 320,
            maxHeight: "70vh",
            overflow: "auto",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {logText || "ここに操作履歴が表示されます。"}
        </pre>
      </div>
    </main>
  );
}
