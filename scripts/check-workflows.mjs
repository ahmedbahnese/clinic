import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const migration = await readFile(new URL("../supabase/migrations/202610280002_security_workflows.sql", import.meta.url), "utf8");
const staffPage = await readFile(new URL("../src/app/staff/page.tsx", import.meta.url), "utf8");

function functionBody(name, nextMarker) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `تعريف الدالة غير موجود: ${name}`);
  const end = migration.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `نهاية الدالة غير محددة: ${name}`);
  return migration.slice(start, end);
}

const internalBooking = functionBody("create_internal_booking", "create or replace function public.confirm_booking");
assert.match(internalBooking, /instructions_snapshot\s*,\s*documents_snapshot/i);
assert.match(internalBooking, /from public\.service_documents/i);
assert.match(internalBooking, /v_instructions/i);

const transfer = functionBody("transfer_booking", "-- Queue lifecycle");
assert.match(transfer, /state\s*=\s*'in_progress'/i);
assert.match(transfer, /instructions_snapshot\s*=\s*coalesce\(v_instructions/i);
assert.match(transfer, /documents_snapshot\s*=\s*coalesce\(v_docs/i);
assert.match(staffPage, /client\.rpc\("reschedule_booking"/);
assert.match(staffPage, /client\.rpc\("transfer_booking"/);

console.log("تم التحقق من لقطات الحجز الداخلي/التحويل وربط واجهة إعادة الجدولة والتحويل بـRPC.");
