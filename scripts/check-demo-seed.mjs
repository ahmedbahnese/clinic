import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const required = [
  "('audiology','abr-computer','رسم سمع كمبيوتر (جذع المخ)',3,false,",
  "('audiology','hearing-test-age-5-plus','رسم سمع (5 سنوات فأكثر)',5,false,",
  "العمر أقل من 5 سنوات وأكبر من 3 شهور.",
  "حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.",
  "الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.",
  "('audiology','ear-pressure-direct','حالات ضغط الأذن',0,true,'')",
  "('audiology','referred-newborn-direct','حالات محولة (مبادرة السمع)',0,true,'')",
];
for (const phrase of required) assert.ok(seed.includes(phrase), `محتوى seed ناقص: ${phrase}`);
assert.match(seed, /on conflict \(slug\) do nothing/i);
assert.match(seed, /on conflict \(clinic_id,slug\) do nothing/i);
console.log("تم التحقق من حفظ خدمات السمعيات وتعليماتها وسياسات direct-only في seed.");
