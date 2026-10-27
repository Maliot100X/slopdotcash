/** #1411 B12: a retryable value outcome backs off instead of retrying at a flat
 * hour forever. The outcome stays retryable — this change bounds the cadence and
 * records the attempt count; it does not make an incomplete delivery terminal.
 */
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { sqliteD1 } from "../../tests/sqlite-d1";
import { recordDelivery } from "./persistence";
import {
  claimValueRequest,
  finishValueRequest,
  nextValueRetryAt,
  valueRetryDelayMs,
} from "./value-processing";

const HOUR = 60 * 60 * 1000;
const job = {
  deliveryId: "backoff-delivery",
  installationId: 1,
  repositoryId: 424242,
  owner: "backoff",
  repo: "queue",
  number: 7,
};

function database() {
  return sqliteD1(
    readdirSync(new URL("../../migrations/", import.meta.url))
      .filter((path) => path.endsWith(".sql"))
      .sort(),
  );
}

type Queue = ReturnType<typeof database>;
interface ProcessingRow {
  attempts: number;
  state: string;
  outcome: string | null;
  retry_at: string | null;
}

const row = (queue: Queue) =>
  queue.db
    .prepare(
      "SELECT attempts,state,outcome,retry_at FROM slopbot_value_processing WHERE delivery_id=?",
    )
    .bind(job.deliveryId)
    .first<ProcessingRow>();

async function seed(queue: Queue) {
  // The subject here is retry scheduling, not intake authority: the delivery row
  // is the one the consumer would have recorded, and the request row is written
  // directly so this case does not depend on a registered project fixture.
  await recordDelivery(queue.db, job.deliveryId, "pull_request");
  queue.sqlite.run(
    "INSERT INTO slopbot_value_requests(delivery_id,installation_id,repository_id,owner,repo,pull_request_number,received_at) VALUES (?,?,?,?,?,?,?)",
    [
      job.deliveryId,
      job.installationId,
      job.repositoryId,
      job.owner,
      job.repo,
      job.number,
      "2026-10-27T00:00:00.000Z",
    ],
  );
}

test("the retry delay doubles from an hour and stops at a day", () => {
  expect([1, 2, 3, 4, 5, 6, 7, 64].map(valueRetryDelayMs)).toEqual([
    HOUR,
    2 * HOUR,
    4 * HOUR,
    8 * HOUR,
    16 * HOUR,
    24 * HOUR,
    24 * HOUR,
    24 * HOUR,
  ]);
});

test("an incomplete result backs off per attempt and records the count", async () => {
  const queue = database();
  await seed(queue);
  let at = new Date("2026-10-28T00:00:00.000Z");
  const expected = [
    HOUR,
    2 * HOUR,
    4 * HOUR,
    8 * HOUR,
    16 * HOUR,
    24 * HOUR,
    24 * HOUR,
  ];
  for (const [index, delay] of expected.entries()) {
    const claim = await claimValueRequest(queue.db, job.deliveryId, at);
    if (!claim) throw new Error("claim was refused before its retry time");
    const retryAt = await nextValueRetryAt(queue.db, job.deliveryId, at);
    expect(retryAt.getTime() - at.getTime()).toBe(delay);
    await finishValueRequest(queue.db, claim, "source-incomplete", retryAt, at);
    const current = await row(queue);
    expect(current?.state).toBe("waiting");
    expect(current?.outcome).toBe("source-incomplete");
    expect(current?.attempts).toBe(index + 1);
    expect(current?.retry_at).toBe(retryAt.toISOString());
    at = retryAt;
  }
});

test("a re-claim before the retry time is refused, and allowed at it", async () => {
  const queue = database();
  await seed(queue);
  const at = new Date("2026-10-28T00:00:00.000Z");
  const claim = await claimValueRequest(queue.db, job.deliveryId, at);
  if (!claim) throw new Error("claim was refused");
  const retryAt = await nextValueRetryAt(queue.db, job.deliveryId, at);
  await finishValueRequest(queue.db, claim, "authority", retryAt, at);
  expect(
    await claimValueRequest(
      queue.db,
      job.deliveryId,
      new Date(retryAt.getTime() - 1),
    ),
  ).toBeNull();
  expect(
    await claimValueRequest(queue.db, job.deliveryId, retryAt),
  ).not.toBeNull();
});

test("a terminal result keeps no retry time and no attempt count", async () => {
  const queue = database();
  await seed(queue);
  const at = new Date("2026-10-28T00:00:00.000Z");
  const claim = await claimValueRequest(queue.db, job.deliveryId, at);
  if (!claim) throw new Error("claim was refused");
  await finishValueRequest(queue.db, claim, "published", null, at);
  const current = await row(queue);
  expect(current?.state).toBe("completed");
  expect(current?.outcome).toBe("published");
  expect(current?.retry_at).toBeNull();
  expect(current?.attempts).toBe(0);
  expect(
    await claimValueRequest(
      queue.db,
      job.deliveryId,
      new Date(at.getTime() + HOUR),
    ),
  ).toBeNull();
});
