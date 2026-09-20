#!/usr/bin/env node
/* file:// protokolünde tarayıcı yetenek ölçümü.
   Kayıt: docs/olcumler/  ·  GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateOnPage } from "./chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };

const { value, error } = await evaluateOnPage(
  `file://${resolve(here, "probe.html")}`,
  "document.getElementById('out').textContent",
  { browser: flag("--browser"), waitFor: "document.getElementById('out').textContent !== 'PENDING'" },
);
if (error){ console.error("probe: hata —", error); process.exit(1); }
console.log(value);
