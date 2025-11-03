import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
    site: "https://celonymire.github.io",
    integrations: [mdx(), sitemap()],
    vite: {
        plugins: [tailwindcss() as any], // FIXME: TailwindCSS giving type issues
    },
});
