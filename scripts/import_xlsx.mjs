import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";


// ====== 設定：必要ならここだけ後で直す ======
const INPUT_XLSX = path.join(process.cwd(), "data.xlsx");

// シート名（あなたのブックに合わせて）
const SHEET_OWN = "所持設計図";        // ユーザー×所持表があるシート
const SHEET_MASTER = "データ(変更禁止)"; // 変換表・分類表があるシート

// ユーザー名が入ってる列（B列）と開始行（3行目）
const USER_COL = "B";
const USER_ROW_START = 3;
const USER_ROW_END = 400;

// 所持マトリクスの範囲（D列からNI列、3行目から）
const MATRIX_COL_START = "D";
const MATRIX_COL_END = "NI";
const MATRIX_ROW_START = 3;
const MATRIX_ROW_END = 400;

// マスタ（艦名→列記号→分類）
// 例：S列=艦名、T列=列記号、Q列=艦種（小型艦/大型艦/艦載機…）
// 行は 1～500 くらいまで見ます（多め）
const MASTER_ROW_START = 1;
const MASTER_ROW_END = 500;
const MASTER_COL_NAME = "S";
const MASTER_COL_LETTER = "T";
const MASTER_COL_TYPE = "Q";
// ============================================

function cellAddr(col, row) {
  return `${col}${row}`;
}

function isOwned(v) {
  // ルール：◯  または 0以上の数値
  if (v === "◯") return true;
  if (typeof v === "number") return v >= 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "◯") return true;
    // 数字文字列も許容
    if (/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(t)) return true;
  }
  return false;
}

function main() {
  if (!fs.existsSync(INPUT_XLSX)) {
    console.log("❌ data.xlsx が見つかりません:", INPUT_XLSX);
    console.log("   プロジェクト直下に data.xlsx を置いてください。");
    process.exit(1);
  }

  const buffer = fs.readFileSync(INPUT_XLSX);
  const wb = XLSX.read(buffer, { type: "buffer" });


  const wsOwn = wb.Sheets[SHEET_OWN];
  const wsMaster = wb.Sheets[SHEET_MASTER];

  if (!wsOwn) {
    console.log(`❌ シートが見つかりません: ${SHEET_OWN}`);
    console.log("   Excel内のシート名を確認してください。");
    process.exit(1);
  }
  if (!wsMaster) {
    console.log(`❌ シートが見つかりません: ${SHEET_MASTER}`);
    console.log("   Excel内のシート名を確認してください。");
    process.exit(1);
  }

  // ===== マスタ読み込み：列記号 -> {name, type} を作る =====
  const byLetter = new Map(); // key: "HG" みたいな列記号

  for (let r = MASTER_ROW_START; r <= MASTER_ROW_END; r++) {
    const nameCell = wsMaster[cellAddr(MASTER_COL_NAME, r)];
    const letterCell = wsMaster[cellAddr(MASTER_COL_LETTER, r)];
    const typeCell = wsMaster[cellAddr(MASTER_COL_TYPE, r)];

    const name = nameCell?.v?.toString().trim() ?? "";
    const letter = letterCell?.v?.toString().trim() ?? "";
    const type = typeCell?.v?.toString().trim() ?? "";

    if (!name || !letter) continue;

    byLetter.set(letter, { name, type: type || "全艦船" });
  }

  // ===== ユーザーごとに所持を集計してJSON化 =====
  const users = {}; // { [userName]: [{name,type}] }

  // 列番号にする
  const colStartNum = XLSX.utils.decode_col(MATRIX_COL_START);
  const colEndNum = XLSX.utils.decode_col(MATRIX_COL_END);

  for (let row = USER_ROW_START; row <= USER_ROW_END; row++) {
    const userCell = wsOwn[cellAddr(USER_COL, row)];
    const userName = userCell?.v?.toString().trim() ?? "";
    if (!userName) continue;

    const owned = [];

    for (let c = colStartNum; c <= colEndNum; c++) {
      const colLetter = XLSX.utils.encode_col(c); // 例: "D"
      const cell = wsOwn[cellAddr(colLetter, row)];
      const v = cell?.v;

      if (!isOwned(v)) continue;

      // “Excelの列記号”は D/E… になるので、マスタの T列がそれに合わせてある前提。
      // もしマスタが HG,HH… のような別列記号の場合は、ここを後で合わせます。
      const meta = byLetter.get(colLetter);

      if (meta) {
        owned.push({ name: meta.name, type: meta.type });
      } else {
        // マスタ未登録でも一応残す（デバッグ用）
        owned.push({ name: `（未登録列）${colLetter}`, type: "全艦船" });
      }
    }

    users[userName] = owned;
  }

  const outDir = path.join(process.cwd(), "src", "data");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "data.json");
  fs.writeFileSync(outPath, JSON.stringify({ users }, null, 2), "utf-8");

  console.log("✅ JSONを書き出しました:", outPath);
  console.log("   ユーザー数:", Object.keys(users).length);
}

main();
