import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

export async function POST(req: Request) {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || "";
  if (!GAS_URL) {
    return NextResponse.json(
      { ok: false, error: "GAS URL not set" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const body = await req.text(); // そのまま転送
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // ← 重要（preflight回避にも効く）
    body,
    cache: "no-store",
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, {
      status: res.ok ? 200 : res.status,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "GASからJSON以外の応答が返されました",
        upstreamStatus: res.status,
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
