/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';
import { defineConfig } from 'vite';
import { mediapipeWasm } from './scripts/mediapipe-wasm.ts';

export default defineConfig({
	test: { include: ['src/**/*.test.ts'] },
	plugins: [mediapipeWasm(), sveltekit({ adapter: adapter() })]
});
