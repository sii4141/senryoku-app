import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || "";
  if (!GAS_URL) return NextResponse.json({ ok: false, error: "GAS URL not set" }, { status: 500 });

  const body = await req.text(); // そのまま転送
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // ← 重要（preflight回避にも効く）
    body,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
