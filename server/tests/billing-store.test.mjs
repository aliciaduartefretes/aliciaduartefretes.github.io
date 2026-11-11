import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../billing-store.mjs";

test("un permiso de curso en vivo crea y revoca el acceso privado de forma determinista", () => {
  const base = {
    userId: "student-1",
    planKey: "guarani_live_full",
    configuredEntitlements: ["live-course:guarani-live-founders-2026", "courses:premium"],
    status: "paid",
    source: "lemon_squeezy_order",
    testMode: true,
    updatedAt: "2026-11-10T18:00:00.000Z"
  };
  const granted = __test.liveCourseEnrollmentDocuments({ ...base, active: true, permanent: true });
  assert.equal(granted.length, 1);
  assert.deepEqual(granted[0].pathSegments, ["liveCourseEnrollments", "guarani-live-founders-2026", "student-1"]);
  assert.equal(granted[0].fields.active, true);
  const revoked = __test.liveCourseEnrollmentDocuments({ ...base, active: false, permanent: false, status: "refunded" });
  assert.equal(revoked[0].fields.active, false);
});
