import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const targetsPath = "/private/tmp/tokyo_itinerary_image_targets.json";
const photoDir = path.join(repoRoot, "assets/itinerary-photos");

function pickPhoto(prefix) {
  const files = fs
    .readdirSync(photoDir)
    .filter((name) => name.startsWith(prefix) && /\.(jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => {
      const aPlace = /(^|-)place\./i.test(a) || /-place-/i.test(a);
      const bPlace = /(^|-)place\./i.test(b) || /-place-/i.test(b);
      if (aPlace !== bPlace) return aPlace ? 1 : -1;
      return a.localeCompare(b);
    });
  if (!files.length) return null;
  return `assets/itinerary-photos/${files[0]}`;
}

const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
const rowToPhoto = new Map();
targets.forEach((target, index) => {
  const prefix = String(index + 1).padStart(3, "0");
  const photo = pickPhoto(prefix);
  if (!photo) {
    throw new Error(`Missing downloaded photo for target ${prefix} row ${target.row_index}: ${target.query}`);
  }
  rowToPhoto.set(target.row_index, photo);
});

let html = fs.readFileSync(indexPath, "utf8");
const startMarker = '<h2 id="4-itinerary-proposal">';
const endMarker = '<h2 id="5">';
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Could not locate Section 4 bounds");

let section = html.slice(start, end);
let rowIndex = -1;
let replaced = 0;

section = section.replace(/<tr>[\s\S]*?<\/tr>/g, (rowHtml) => {
  if (!/<td[\s>]/.test(rowHtml)) return rowHtml;
  rowIndex += 1;
  const photo = rowToPhoto.get(rowIndex);
  if (!photo) return rowHtml;

  let cellIndex = -1;
  const next = rowHtml.replace(/<td\b[^>]*>[\s\S]*?<\/td>/g, (cellHtml) => {
    cellIndex += 1;
    if (cellIndex !== 2) return cellHtml;
    replaced += 1;
    const klass = /class="big"/.test(cellHtml) ? ' class="big"' : "";
    return `<td><img${klass} src="${photo}"></td>`;
  });

  if (cellIndex < 2) {
    throw new Error(`Row ${rowIndex} did not have a feature-image cell`);
  }
  return next;
});

html = html.slice(0, start) + section + html.slice(end);
fs.writeFileSync(indexPath, html);
console.log(`replaced ${replaced} Section 4 feature-image cells`);
