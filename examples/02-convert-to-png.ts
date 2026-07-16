/**
 * Render a 300 dpi PNG preview of a 4×6" shipping label.
 *
 * Run: ZPLJET_API_KEY=zpl_… npx tsx examples/02-convert-to-png.ts
 */
import { writeFile } from "node:fs/promises";
import { ZplJet } from "../src/index"; // in your project: from "zpljet"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

const label = await zpljet.convert({
  zpl: `^XA
^FO40,40^A0N,60,60^FDACME Logistics^FS
^FO40,130^BY3^BCN,120,Y,N,N^FD123456789012^FS
^XZ`,
  format: "png",
  dpmm: 12, // 300 dpi
  widthMm: 101.6,
  heightMm: 152.4,
});

await writeFile("label.png", label.data);
console.log(`Saved label.png (${label.data.byteLength} bytes)`);
