# Ramnath Babu — Portfolio

Scroll-driven 3D portfolio (three.js, no build step). Live Chennai time and weather drive the scene.

## Run locally

```bash
python3 -m http.server 5173
```

Open http://localhost:5173 — add `?t=18:00` to preview a time or `?weather=rain|storm|cloudy|fog|clear` to preview weather.

## Deploy

Static site — import this repo in Vercel (framework preset: Other, no build command, output directory: `/`).
