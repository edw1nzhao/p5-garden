import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ =
	'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const target = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../static/mediapipe/hand_landmarker.task'
);

/** @param {Uint8Array} bytes */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const matches = () => existsSync(target) && digest(readFileSync(target)) === SHA256;

if (process.argv.includes('--verify')) {
	if (!matches()) {
		console.error(`${target} is missing or does not match ${SHA256}`);
		process.exit(1);
	}
} else if (!matches()) {
	const response = await fetch(URL_);
	if (!response.ok) throw new Error(`${URL_} returned ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (digest(bytes) !== SHA256) throw new Error(`Downloaded model hash is ${digest(bytes)}`);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, bytes);
}
console.log(`hand_landmarker.task ok (${SHA256.slice(0, 12)})`);
