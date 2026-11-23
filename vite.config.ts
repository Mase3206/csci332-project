import { svelteDevtools } from '@sveltejs/vite-devtools-svelte';
import { link_check } from '@mdsvex/plugin-link-check';
import { page_data } from '@mdsvex/plugin-page-data';
import { numbering } from '@mdsvex/plugin-numbering';
import { external_links } from '@mdsvex/plugin-external-links';
import { toc } from '@mdsvex/plugin-toc';
import { anchors } from '@mdsvex/plugin-anchors';
import { figures } from '@mdsvex/plugin-figures';
import { embeds } from '@mdsvex/plugin-embeds';
import { diagram } from '@mdsvex/plugin-diagram';
import { code_blocks } from '@mdsvex/plugin-code-blocks';
import { tabs } from '@mdsvex/plugin-tabs';
import { steps } from '@mdsvex/plugin-steps';
import { elements } from '@mdsvex/plugin-elements';
import { callouts } from '@mdsvex/plugin-callouts';
import { mdsvex } from 'mdsvex';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		svelteDevtools(),
		mdsvex({
			heading_ids: true,
			unwrap_images: true,
			plugins: [
				callouts(),
				elements(),
				steps(),
				tabs(),
				code_blocks(),
				diagram(),
				embeds(),
				figures(),
				anchors(),
				toc(),
				external_links(),
				numbering(),
				page_data(),
				link_check()
			]
		}),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	devtools: { apply: 'serve', clientAuth: true }
});
