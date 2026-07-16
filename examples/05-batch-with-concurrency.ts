/**
 * Convert a batch of labels with a small concurrency limit so you stay under
 * your plan's per-second rate limit (the SDK still auto-retries any 429s).
 *
 * Run: ZPLJET_API_KEY=zpl_… npx tsx examples/05-batch-with-concurrency.ts
 */
import { writeFile } from "node:fs/promises";
import { ZplJet } from "../src/index"; // in your project: from "zpljet"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY!, maxRetries: 5 });

const orders = ["A-1001", "A-1002", "A-1003", "A-1004", "A-1005", "A-1006"];
const CONCURRENCY = 2; // match your plan's rate limit

async function renderOrder(orderId: string) {
  const label = await zpljet.convert({
    zpl: `^XA^FO40,40^A0N,50,50^FDOrder ${orderId}^FS^FO40,120^BY3^BCN,100,Y,N,N^FD${orderId}^FS^XZ`,
  });
  await writeFile(`${orderId}.pdf`, label.data);
  return orderId;
}

// Tiny concurrency pool — no dependencies needed.
const queue = [...orders];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) {
    console.log(`✓ ${await renderOrder(next)}.pdf`);
  }
});
await Promise.all(workers);

console.log(`Done — ${orders.length} labels rendered.`);
