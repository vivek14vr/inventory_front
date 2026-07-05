import type { AuditLogEntry } from "@/types/audit";

function metaString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

/** Keys that are internal IDs — never show in the activity log */
const HIDDEN_META_KEYS = new Set([
  "warehouseId",
  "productId",
  "brandId",
  "transferId",
  "sourceWarehouseId",
  "destinationWarehouseId",
  "checklistId",
  "taskId",
  "userId",
  "initiatedBy",
  "receivedBy",
  "returnedBy",
  "entityId",
]);

function isHiddenKey(key: string): boolean {
  if (HIDDEN_META_KEYS.has(key)) return true;
  if (key.endsWith("Id") || key.endsWith("_id")) return true;
  return false;
}

function transferRoute(meta: Record<string, unknown>): string | undefined {
  const from =
    metaString(meta.sourceWarehouseName) ?? metaString(meta.warehouseName);
  const fromCode =
    metaString(meta.sourceWarehouseCode) ?? metaString(meta.warehouseCode);
  const to = metaString(meta.destinationWarehouseName);
  const toCode = metaString(meta.destinationWarehouseCode);
  const product = metaString(meta.productName);
  const brand = metaString(meta.brandName);
  const qty = metaString(meta.quantity);

  if (!from && !to && !product && !qty) return undefined;

  const fromLabel = from ? `${from}${fromCode ? ` (${fromCode})` : ""}` : undefined;
  const toLabel = to ? `${to}${toCode ? ` (${toCode})` : ""}` : undefined;
  const item = product ? `${product}${brand ? ` · ${brand}` : ""}` : undefined;
  const qtyLabel = qty ? `${qty} units` : undefined;

  const parts: string[] = [];
  if (fromLabel && toLabel) parts.push(`${fromLabel} → ${toLabel}`);
  else if (fromLabel) parts.push(fromLabel);
  else if (toLabel) parts.push(`To ${toLabel}`);
  if (item) parts.push(item);
  if (qtyLabel) parts.push(qtyLabel);

  return parts.length ? parts.join(" · ") : undefined;
}

function actorLine(meta: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const initiated = metaString(meta.initiatedByName);
  const received = metaString(meta.receivedByName);
  const returned = metaString(meta.returnedByName);

  if (initiated) parts.push(`Sent by ${initiated}`);
  if (received) parts.push(`Received by ${received}`);
  if (returned) parts.push(`Returned by ${returned}`);

  return parts.length ? parts.join(" · ") : undefined;
}

function quantityOnly(meta: Record<string, unknown>, suffix = ""): string | undefined {
  const qty = metaString(meta.quantity);
  if (!qty) return undefined;
  return suffix ? `${qty} units ${suffix}`.trim() : `${qty} units`;
}

function formatRemainingMeta(meta: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    quantity: "Quantity",
    email: "Email",
    name: "Name",
    clientName: "Client",
    invoiceNumber: "Invoice",
    notes: "Notes",
    dispatchType: "Type",
    status: "Status",
    title: "Title",
    taskTitle: "Task",
    checklistTitle: "Checklist",
    dueTime: "Due by",
    completedLate: "After deadline",
    userName: "User",
    date: "Date",
    adminOverride: "Admin override",
    restoredBalance: "Balance restored",
    destinationBalance: "Destination balance",
    sourceBalance: "Source balance",
    assignedUserCount: "Users assigned",
    taskCount: "Tasks",
    permissionsGranted: "Initial access",
    granted: "Granted",
    revoked: "Revoked",
    totalGrants: "Total grants",
    targetUserName: "User",
    targetUserEmail: "Email",
    successCount: "Imported",
    failedCount: "Failed",
    skippedCount: "Skipped",
    fileName: "File",
    sessionsRevoked: "Sessions revoked",
  };

  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (isHiddenKey(key)) continue;
    if (value === null || value === undefined || value === "") continue;

    const label = labels[key] ?? key.replace(/([A-Z])/g, " $1").trim();
    if (Array.isArray(value)) {
      parts.push(`${label}: ${value.join(", ")}`);
    } else if (typeof value === "object") {
      continue;
    } else {
      const str = metaString(value);
      if (str) parts.push(`${label}: ${str}`);
    }
  }
  return parts.join(" · ");
}

export function formatAuditDetails(log: AuditLogEntry): string {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const action = log.action;

  if (
    action.startsWith("TRANSFER_") ||
    (action === "STOCK_OUT" && meta.dispatchType === "TRANSFER")
  ) {
    const route = transferRoute(meta);
    const actors = actorLine(meta);
    const status = metaString(meta.status);
    const parts = [route, actors, status ? `Status: ${status}` : undefined].filter(Boolean);
    if (parts.length) return parts.join(" · ");
    const qty = quantityOnly(meta, action === "TRANSFER_RECEIVED" ? "received" : "");
    if (qty) return qty;
  }

  if (action === "STOCK_IN" || action === "STOCK_OUT") {
    const route = transferRoute(meta);
    if (route) {
      const client = metaString(meta.clientName);
      const invoice = metaString(meta.invoiceNumber);
      const sale =
        client || invoice
          ? `Sale to ${client ?? "client"}${invoice ? ` (#${invoice})` : ""}`
          : undefined;
      return [route, sale].filter(Boolean).join(" · ");
    }
    const qty = quantityOnly(
      meta,
      action === "STOCK_IN" ? "added" : action === "STOCK_OUT" ? "removed" : ""
    );
    if (qty) return qty;
  }

  if (action === "INVOICE_UPDATED") {
    const product = metaString(meta.productName);
    const prev = metaString(meta.previousInvoiceNumber);
    const next = metaString(meta.invoiceNumber);
    const prevQty = meta.previousQuantity;
    const nextQty = meta.quantity;
    const qtyPart =
      prevQty !== undefined && nextQty !== undefined
        ? `qty ${prevQty} → ${nextQty}`
        : undefined;
    const invoicePart =
      prev && next
        ? `${prev} → ${next}`
        : next
          ? `Set to ${next}`
          : prev
            ? `Cleared ${prev}`
            : undefined;
    return [
      product ? `Invoice fix · ${product}` : "Invoice updated",
      invoicePart,
      qtyPart,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (action === "STOCK_ADJUSTED") {
    const product = metaString(meta.productName);
    const warehouse = metaString(meta.warehouseName);
    const code = metaString(meta.warehouseCode);
    const prev = metaString(meta.previous);
    const next = metaString(meta.next);
    const reason = metaString(meta.reason);
    return [
      product ? `Adjusted ${product}` : "Stock adjusted",
      warehouse ? `at ${warehouse}${code ? ` (${code})` : ""}` : undefined,
      prev !== undefined && next !== undefined
        ? `${prev} → ${next} units`
        : undefined,
      reason ? `· ${reason}` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (action === "INVOICE_DELETED") {
    const product = metaString(meta.productName);
    const invoice = metaString(meta.invoiceNumber);
    const qty = metaString(meta.quantity);
    return [
      product ? `Deleted sale invoice · ${product}` : "Deleted sale invoice",
      invoice ? `#${invoice}` : undefined,
      qty ? `${qty} units restored` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (action === "LOGIN" || action === "LOGOUT") {
    const email = metaString(meta.email);
    if (email) return email;
  }

  if (action === "USER_CREATED") {
    const name = metaString(meta.name);
    const email = metaString(meta.email);
    const role = metaString(meta.role);
    const perms = meta.permissionsGranted as string[] | undefined;
    const parts = [
      name ? `Created ${name}` : "User created",
      email,
      role ? `role ${role}` : undefined,
    ];
    if (perms?.length) {
      parts.push(`access: ${perms.join("; ")}`);
    }
    return parts.filter(Boolean).join(" · ");
  }

  if (action === "USER_PERMISSIONS_UPDATED") {
    const target = metaString(meta.targetUserName) ?? metaString(meta.targetUserEmail);
    const granted = meta.granted as string[] | undefined;
    const revoked = meta.revoked as string[] | undefined;
    const parts = [target ? `Access updated for ${target}` : "User permissions updated"];
    if (granted?.length) parts.push(`Granted: ${granted.join("; ")}`);
    if (revoked?.length) parts.push(`Revoked: ${revoked.join("; ")}`);
    const total = metaString(meta.totalGrants);
    if (total && !granted?.length && !revoked?.length) {
      parts.push(`${total} grants total`);
    }
    return parts.join(" · ");
  }

  if (action === "PRODUCT_IMPORT") {
    const file = metaString(meta.fileName);
    const warehouse = metaString(meta.warehouseName);
    const code = metaString(meta.warehouseCode);
    const success = metaString(meta.successCount);
    const failed = metaString(meta.failedCount);
    return [
      "Product catalog import",
      file,
      warehouse ? `audit warehouse ${warehouse}${code ? ` (${code})` : ""}` : undefined,
      success !== undefined && failed !== undefined
        ? `${success} imported, ${failed} failed`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (action === "USER_UPDATED") {
    const target = metaString(meta.targetUserName) ?? metaString(meta.targetUserEmail);
    const rawChanges = meta.changes as string[] | undefined;
    const changes = rawChanges
      ?.filter((c) => c !== "password")
      .map((c) => (c === "warehouseId" ? "home warehouse" : c));
    const passwordChanged = rawChanges?.includes("password");
    const active =
      meta.isActive === true ? "activated" : meta.isActive === false ? "deactivated" : undefined;
    return [
      target ? `Updated ${target}` : "User updated",
      active,
      passwordChanged ? "password reset" : undefined,
      changes?.length ? changes.join(", ") : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (action.startsWith("CHECKLIST_")) {
    const title = metaString(meta.checklistTitle);
    const task = metaString(meta.taskTitle);
    const date = metaString(meta.date);
    if (action === "CHECKLIST_TASK_COMPLETED") {
      const due = metaString(meta.dueTime);
      const late = meta.completedLate === true;
      return [
        `Completed "${task ?? "task"}"`,
        title ? `in ${title}` : undefined,
        date,
        due ? `due ${due}` : undefined,
        late ? "(after deadline)" : undefined,
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (action === "CHECKLIST_TASK_UNCOMPLETED") {
      return [`Unchecked "${task ?? "task"}"`, title ? `in ${title}` : undefined, date]
        .filter(Boolean)
        .join(" ");
    }
    if (action === "CHECKLIST_CREATED") {
      return `Created checklist "${title ?? metaString(meta.title) ?? "Untitled"}"`;
    }
    if (action === "CHECKLIST_UPDATED") {
      return `Updated checklist "${title ?? "checklist"}"`;
    }
  }

  const readable = formatRemainingMeta(meta);
  if (readable) return readable;

  const qty = quantityOnly(meta);
  if (qty) return qty;

  if (Object.keys(meta).length === 0) return "—";
  return "—";
}

export function formatAuditActionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
