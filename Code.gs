const SHEET_OWNED = "所持設計図";
const SHEET_MASTER = "データ(変更禁止)";

const USER_COL = 2;
const USER_ROW_START = 3;
const USER_ROW_END = 149;

const MASTER_NAME_COL = 19; // S
const MASTER_KEY_COL = 20;  // T

const UNUSED_PT_COL = {
  "フリゲート": "PN",
  "駆逐艦": "PO",
  "巡洋艦": "PP",
  "戦闘機": "PQ",
  "護送艦": "PR",
  "巡洋戦艦": "PS",
  "航空母艦": "PT",
  "支援艦": "PU",
  "戦艦": "PV",
};

const UNUSED_CLASSES = Object.keys(UNUSED_PT_COL);
const LOG_SPREADSHEET_ID = "14eiFaTJHMedvz0N08Nz00n4-k30iPoiWIgkNZyXb7IY";
const LOG_SHEET_NAME = "操作ログ";

function doGet() {
  return jsonOut_({ ok: true, msg: "ok" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "").trim();

    if (action === "logAction") {
      return jsonOut_(logAction_(body));
    }

    if (action === "createUser") {
      return jsonOut_(createUser_(String(body.userName || "").trim()));
    }

    if (action === "deleteUser") {
      return jsonOut_(deleteUser_(String(body.userName || "").trim()));
    }

    if (action === "upsertOwn") {
      return jsonOut_(upsertOwn_(
        String(body.userName || "").trim(),
        String(body.shipName || "").trim(),
        String(body.series || "").trim(),
        body.own
      ));
    }

    if (action === "upsertPt") {
      return jsonOut_(upsertPt_(
        String(body.userName || "").trim(),
        String(body.series || "").trim(),
        body.pt
      ));
    }

    if (action === "upsertUnusedPt") {
      return jsonOut_(upsertUnusedPt_(
        String(body.userName || "").trim(),
        String(body.cls || "").trim(),
        body.pt
      ));
    }

    if (action === "export") {
      return jsonOut_(Object.assign({ ok: true }, export_()));
    }

    return jsonOut_({ ok: false, error: "unknown action", action: action });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: err && err.stack ? err.stack : String(err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function createUser_(userName) {
  if (!userName) return { ok: false, error: "empty userName" };

  const existingRow = findUserRow_(userName);
  if (existingRow > 0) {
    return { ok: true, status: "exists", row: existingRow };
  }

  const sh = getOwnedSheet_();
  const numRows = USER_ROW_END - USER_ROW_START + 1;
  const values = sh.getRange(USER_ROW_START, USER_COL, numRows, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || "").trim()) {
      const row = USER_ROW_START + i;
      sh.getRange(row, USER_COL).setValue(userName);
      return { ok: true, status: "created", row: row };
    }
  }

  return { ok: false, error: "no empty row" };
}

function upsertOwn_(userName, shipName, series, own) {
  if (!userName || !shipName) {
    return { ok: false, error: "missing userName or shipName" };
  }

  const row = ensureUserRow_(userName);
  const shipColLetter = findColLetterByName_(shipName);

  if (!shipColLetter) {
    return { ok: false, error: "ship not found in master", shipName: shipName };
  }

  const sh = getOwnedSheet_();
  const shipCol = letterToColumn_(shipColLetter);
  const isOwned = !(
    own === false || own === "false" || own === 0 || own === "0" ||
    own === null || typeof own === "undefined"
  );

  let initializedSeriesPt = false;
  let seriesColLetter = "";

  // 所有に変える前に同シリーズのモデルが1つもなければ、シリーズPtを0にする。
  // 所有更新とPt初期化を同じロック内で行うため、同時操作でも判定がずれない。
  if (isOwned && series) {
    seriesColLetter = findColLetterByName_(series);

    if (seriesColLetter) {
      const seriesCol = letterToColumn_(seriesColLetter);
      const memberRange = findSeriesMemberRange_(sh, seriesCol);

      if (memberRange && memberRange.startCol <= memberRange.endCol) {
        const memberValues = sh
          .getRange(row, memberRange.startCol, 1, memberRange.endCol - memberRange.startCol + 1)
          .getDisplayValues()[0];

        const alreadyOwnsSeries = memberValues.some(function (value) {
          return String(value || "").trim() === "◯";
        });

        if (!alreadyOwnsSeries) {
          sh.getRange(row, seriesCol).setValue(0);
          initializedSeriesPt = true;
        }
      }
    }
  }

  sh.getRange(row, shipCol).setValue(isOwned ? "◯" : "-");

  return {
    ok: true,
    row: row,
    colLetter: shipColLetter,
    own: isOwned,
    series: series,
    seriesColLetter: seriesColLetter,
    initializedSeriesPt: initializedSeriesPt,
  };
}

function findSeriesMemberRange_(sheet, seriesCol) {
  const lastCol = sheet.getLastColumn();
  if (seriesCol < 1 || seriesCol >= lastCol) return null;

  const headers = sheet
    .getRange(2, seriesCol + 1, 1, lastCol - seriesCol)
    .getDisplayValues()[0];

  let nextSeriesCol = lastCol + 1;
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim() === "Pt") {
      nextSeriesCol = seriesCol + 1 + i;
      break;
    }
  }

  return {
    startCol: seriesCol + 1,
    endCol: nextSeriesCol - 1,
  };
}

function upsertPt_(userName, series, pt) {
  if (!userName || !series) {
    return { ok: false, error: "missing userName or series" };
  }

  const row = ensureUserRow_(userName);
  const colLetter = findColLetterByName_(series);
  if (!colLetter) {
    return { ok: false, error: "series not found in master", series: series };
  }

  const cell = getOwnedSheet_().getRange(row, letterToColumn_(colLetter));
  const parsed = parseNullablePoint_(pt);

  if (parsed === null) {
    cell.clearContent();
    return { ok: true, row: row, colLetter: colLetter, pt: null, cleared: true };
  }

  cell.setValue(parsed);
  return { ok: true, row: row, colLetter: colLetter, pt: parsed, cleared: false };
}

function upsertUnusedPt_(userName, cls, pt) {
  if (!userName || !cls) {
    return { ok: false, error: "missing userName or cls" };
  }

  const colLetter = UNUSED_PT_COL[cls];
  if (!colLetter) {
    return { ok: false, error: "unknown cls", cls: cls };
  }

  const row = ensureUserRow_(userName);
  const cell = getOwnedSheet_().getRange(row, letterToColumn_(colLetter));
  const parsed = parseNullablePoint_(pt);

  if (parsed === null) {
    cell.clearContent();
    return { ok: true, row: row, colLetter: colLetter, pt: null, cleared: true };
  }

  cell.setValue(parsed);
  return { ok: true, row: row, colLetter: colLetter, pt: parsed, cleared: false };
}

function deleteUser_(userName) {
  if (!userName) return { ok: false, error: "empty userName" };

  const row = findUserRow_(userName);
  if (row < 0) return { ok: false, error: "user not found" };

  const sh = getOwnedSheet_();
  const master = getMasterEntries_();

  sh.getRange(row, USER_COL).clearContent();

  // マスターにある列のみ初期化する。2行目がPtの列は空欄、モデル列は「-」。
  master.forEach(function (entry) {
    const col = letterToColumn_(entry.colLetter);
    if (col < 4 || col > sh.getLastColumn()) return;

    const isPtColumn = String(sh.getRange(2, col).getDisplayValue()).trim() === "Pt";
    if (isPtColumn) {
      sh.getRange(row, col).clearContent();
    } else {
      sh.getRange(row, col).setValue("-");
    }
  });

  UNUSED_CLASSES.forEach(function (cls) {
    sh.getRange(row, letterToColumn_(UNUSED_PT_COL[cls])).clearContent();
  });

  return { ok: true, deletedRow: row };
}

function export_() {
  const sh = getOwnedSheet_();
  const master = getMasterEntries_();
  const numUsers = USER_ROW_END - USER_ROW_START + 1;
  const lastCol = sh.getLastColumn();
  const values = sh.getRange(USER_ROW_START, 1, numUsers, lastCol).getValues();
  const headers = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0];

  const colToName = {};
  master.forEach(function (entry) {
    colToName[letterToColumn_(entry.colLetter)] = entry.name;
  });

  const users = {};
  const seriesPointsByUser = {};
  const unusedPointsByUser = {};

  for (let r = 0; r < numUsers; r++) {
    const row = values[r];
    const userName = String(row[USER_COL - 1] || "").trim();
    if (!userName) continue;

    users[userName] = [];
    seriesPointsByUser[userName] = {};
    unusedPointsByUser[userName] = {};

    UNUSED_CLASSES.forEach(function (cls) {
      const col = letterToColumn_(UNUSED_PT_COL[cls]);
      unusedPointsByUser[userName][cls] = toNumberOrZero_(row[col - 1]);
    });

    for (let col = 4; col <= lastCol; col++) {
      const name = colToName[col];
      if (!name) continue;

      const cell = row[col - 1];
      if (cell === "" || cell === null) continue;

      if (String(cell).trim() === "◯") {
        users[userName].push({ name: name, type: "小型艦" });
        continue;
      }

      // 数値はシリーズPt列だけを出力する。「-」を0として出力しない。
      const isPtColumn = String(headers[col - 1] || "").trim() === "Pt";
      if (isPtColumn) {
        const n = Number(cell);
        if (Number.isFinite(n)) seriesPointsByUser[userName][name] = n;
      }
    }
  }

  return {
    users: users,
    seriesPointsByUser: seriesPointsByUser,
    unusedPointsByUser: unusedPointsByUser,
  };
}

function logAction_(body) {
  const logSs = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  const sheet = logSs.getSheetByName(LOG_SHEET_NAME) || logSs.insertSheet(LOG_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["日時", "ユーザー名", "操作", "内容", "ページ", "UserAgent"]);
  }

  sheet.appendRow([
    body.timestamp || new Date(),
    body.userName || "",
    body.operation || "",
    body.detail || "",
    body.page || "",
    body.userAgent || "",
  ]);

  return { ok: true };
}

function getOwnedSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_OWNED);
  if (!sh) throw new Error("Sheet not found: " + SHEET_OWNED);
  return sh;
}

function getMasterSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MASTER);
  if (!sh) throw new Error("Sheet not found: " + SHEET_MASTER);
  return sh;
}

function findUserRow_(userName) {
  const sh = getOwnedSheet_();
  const numRows = USER_ROW_END - USER_ROW_START + 1;
  const values = sh.getRange(USER_ROW_START, USER_COL, numRows, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === userName) {
      return USER_ROW_START + i;
    }
  }
  return -1;
}

function ensureUserRow_(userName) {
  const existingRow = findUserRow_(userName);
  if (existingRow > 0) return existingRow;

  const created = createUser_(userName);
  if (!created.ok) throw new Error(created.error || "failed to create user");
  return created.row;
}

function getMasterEntries_() {
  const sh = getMasterSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh
    .getRange(2, MASTER_NAME_COL, lastRow - 1, 2)
    .getDisplayValues();

  return values
    .map(function (row) {
      return {
        name: String(row[0] || "").trim(),
        colLetter: String(row[1] || "").trim().toUpperCase(),
      };
    })
    .filter(function (entry) {
      return entry.name && entry.colLetter;
    });
}

function findColLetterByName_(name) {
  const target = normalize_(name);
  const entries = getMasterEntries_();

  for (let i = 0; i < entries.length; i++) {
    if (normalize_(entries[i].name) === target) return entries[i].colLetter;
  }
  return "";
}

function parseNullablePoint_(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("pt is not a number: " + value);
  return Math.max(0, Math.floor(n));
}

function toNumberOrZero_(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

function normalize_(value) {
  return String(value || "")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

function letterToColumn_(letter) {
  const value = String(letter || "").trim().toUpperCase();
  let col = 0;
  for (let i = 0; i < value.length; i++) {
    col = col * 26 + value.charCodeAt(i) - 64;
  }
  return col;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
