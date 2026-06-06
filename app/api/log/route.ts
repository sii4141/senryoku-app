import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "action-log.txt");

function formatDateJST(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getPassword() {
  return process.env.LOG_VIEW_PASSWORD || "28722872";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const time = body.timestamp ? formatDateJST(new Date(body.timestamp)) : formatDateJST(new Date());
    const userName = String(body.userName || "");
    const operation = String(body.operation || "");
    const detail = String(body.detail || "");
    const page = String(body.page || "");
    const userAgent = String(body.userAgent || "");

    const line = [
      `[${time}]`,
      `ユーザー: ${userName}`,
      `操作: ${operation}`,
      `内容: ${detail}`,
      `ページ: ${page}`,
      `UserAgent: ${userAgent}`,
      "",
    ].join("\n");

    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line, "utf8");

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("log write failed:", e);
    return NextResponse.json({ ok: false, error: "log write failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get("password") || "";
  if (password !== getPassword()) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const text = await readFile(LOG_FILE, "utf8");
    return NextResponse.json({ ok: true, text });
  } catch {
    return NextResponse.json({ ok: true, text: "" });
  }
}

export async function DELETE(req: NextRequest) {
  const password = req.nextUrl.searchParams.get("password") || "";
  if (password !== getPassword()) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(LOG_FILE, "", "utf8");
  return NextResponse.json({ ok: true });
}
