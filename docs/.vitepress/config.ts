import { defineConfig } from "vitepress";

export default defineConfig({
  title: "imcjs: Parse IMC data files in the browser",
  description: "API Reference & User Manual",

  themeConfig: {
    nav: [
      { text: "Usage", link: "/guides/getting-started" },
      { text: "API Reference", link: "/api/index.html", target: "_self" }
    ],
    
    sidebar: {
      "/guides/": [
        {
          text: "Usage",
          items: [
            { text: "Getting Started", link: "/guides/getting-started" },
          ]
        }
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "TypeDoc Output", link: "/api/index.html" }
          ]
        }
      ]
    }
  }
});