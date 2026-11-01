import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

const SOURCE = resolve('node_modules/@mediapipe/tasks-vision/wasm');
const PREFIX = '/mediapipe/wasm/';

function serve(): Connect.NextHandleFunction {
	return (req, res, next) => {
		const url = req.url?.split('?')[0] ?? '';
		if (!url.startsWith(PREFIX)) return next();
		const file = resolve(SOURCE, url.slice(PREFIX.length));
		if (!file.startsWith(SOURCE + '/') || !existsSync(file)) return next();
		res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
		createReadStream(file).pipe(res);
	};
}

export function mediapipeWasm(): Plugin {
	return {
		name: 'mediapipe-wasm',
		configureServer: (server) => void server.middlewares.use(serve()),
		generateBundle() {
			if (this.environment.name !== 'client') return;
			for (const name of readdirSync(SOURCE)) {
				this.emitFile({
					type: 'asset',
					fileName: `mediapipe/wasm/${name}`,
					source: readFileSync(resolve(SOURCE, name))
				});
			}
		}
	};
}
