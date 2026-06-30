import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/imcjs/",
  title: "imcjs: Parse Imaging Mass Cytometry (IMC) MCD and TXT files in the browser or with Node",
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
            { text: "Reading Acquisitions", link: "/guides/acquisitions" },
          ]
        }
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "TypeDoc Output", link: "./api/index.html" }
          ]
        }
      ]
    }
  }
});