import { spawnSync } from 'node:child_process';

const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error('CHROME_BIN is not set');

const result = spawnSync(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--virtual-time-budget=10000',
  '--dump-dom',
  'http://127.0.0.1:4173/'
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (result.status !== 0) {
  console.error(result.stderr);
  throw new Error(`Chrome exited with status ${result.status}`);
}

const html = result.stdout;
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] ?? '';
};
const numberAttribute = (tag, name) => Number(attribute(tag, name));
const titleOf = fragment => fragment.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';

const bands = [...html.matchAll(/<rect\b[^>]*class="global-event-range"[^>]*>[\s\S]*?<\/rect>/g)].map(match => {
  const tag = match[0].slice(0, match[0].indexOf('>') + 1);
  return {
    title: titleOf(match[0]),
    x: numberAttribute(tag, 'x'),
    width: numberAttribute(tag, 'width')
  };
});

const labels = [...html.matchAll(/<g\b[^>]*class="global-event-label"[^>]*>[\s\S]*?<\/g>/g)].map(match => {
  const tag = match[0].slice(0, match[0].indexOf('>') + 1);
  const transform = attribute(tag, 'transform').match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
  const pointer = match[0].match(/<path\b[^>]*class="global-event-label-pointer"[^>]*d="([^"]+)"/);
  const pointerTip = pointer?.[1].match(/L\s+([-\d.]+)\s+25\s+Z/);
  return {
    title: titleOf(match[0]),
    centerX: Number(transform?.[1]),
    y: Number(transform?.[2]),
    pointerOffset: Number(pointerTip?.[1])
  };
});

if (!bands.length || bands.length !== labels.length) {
  throw new Error(`Expected matching event bands and labels; found ${bands.length} bands and ${labels.length} labels`);
}

const bandByTitle = new Map(bands.map(band => [band.title, band]));
const midpointErrors = labels.map(label => {
  const band = bandByTitle.get(label.title);
  if (!band) throw new Error(`No event band matched label ${label.title}`);
  const pointerAnchor = label.centerX + label.pointerOffset;
  const bandMidpoint = band.x + band.width / 2;
  return Math.abs(pointerAnchor - bandMidpoint);
});
if (Math.max(...midpointErrors) > 0.01) {
  throw new Error(`A label pointer was not centered over its band: ${JSON.stringify(midpointErrors)}`);
}

const yearTags = [...html.matchAll(/<text\b[^>]*class="(?:major-label|decade-label)"[^>]*>/g)].map(match => match[0]);
if (!yearTags.length) throw new Error('No year labels rendered');
const yearRowY = numberAttribute(yearTags[0], 'y');
const nearestPointerTipY = Math.max(...labels.map(label => label.y + 25));
const labelToYearGap = yearRowY - nearestPointerTipY;
if (labelToYearGap !== 11) {
  throw new Error(`Expected event labels immediately above the year row; measured ${labelToYearGap}px`);
}

const rulerTag = html.match(/<svg\b[^>]*id="timeline-ruler"[^>]*>/)?.[0];
const rulerHeight = numberAttribute(rulerTag || '', 'height');
if (rulerHeight !== 60) {
  throw new Error(`Expected the one-lane ruler to compact to 60px; got ${rulerHeight}`);
}

const baselineTag = html.match(/<line\b[^>]*class="ruler-line"[^>]*>/)?.[0];
const baselineY = numberAttribute(baselineTag || '', 'y1');
const nodeTransforms = [...html.matchAll(/<g\b[^>]*class="timeline-node[^"]*"[^>]*transform="translate\(([-\d.]+)[ ,]([-\d.]+)\)"/g)]
  .map(match => Number(match[2]));
if (!nodeTransforms.length) throw new Error('No timeline nodes rendered');
const firstNodeY = Math.min(...nodeTransforms);
if (firstNodeY - baselineY !== 1) {
  throw new Error(`Expected first node 1px below ruler; got ${firstNodeY - baselineY}px`);
}

console.log(JSON.stringify({
  labels: labels.length,
  midpointErrors,
  labelToYearGap,
  rulerHeight,
  baselineY,
  firstNodeY
}, null, 2));
