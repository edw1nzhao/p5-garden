/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';
import { defineConfig } from 'vite';

export default defineConfig({
	test: { include: ['src/**/*.test.ts'] },
	plugins: [sveltekit({ adapter: adapter() })]
});
