import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || "";
  if (!GAS_URL) {
    return NextResponse.json({ ok: false, error: "GAS URL not set" }, { status: 500 });
  }

  const payload = await req.text(); // page.tsx から来たJSON文字列

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
