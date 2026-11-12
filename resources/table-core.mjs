export function parseOrders(text) {
  const table = parseCsv(text.replace(/^\uFEFF/u, ""));
  const headers = ["order_id", "customer", "status", "amount", "refund"];
  if (JSON.stringify(table[0]) !== JSON.stringify(headers))
    throw new Error(`CSV 表头必须为 ${headers.join(",")}`);
  const ids = new Set();
  return table.slice(1).map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`CSV 第 ${index + 2} 行列数错误。`);
    const [orderId, customer, status, amount, refund] = cells;
    if (!orderId || !customer || ids.has(orderId))
      throw new Error(`CSV 第 ${index + 2} 行缺少 ID/客户或订单重复。`);
    ids.add(orderId);
    if (!["paid", "cancelled", "refunded"].includes(status))
      throw new Error(`未知订单状态：${status}`);
    const amountCents = toCents(amount),
      refundCents = toCents(refund);
    if (refundCents > amountCents)
      throw new Error(`订单 ${orderId} 退款大于金额。`);
    return { orderId, customer, status, amountCents, refundCents };
  });
}

function toCents(value) {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value))
    throw new Error(`金额必须是非负、最多两位小数：${value}`);
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("金额超过安全整数范围。");
  return cents;
}

function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 引号未闭合。");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
