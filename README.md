# TanStack Start Template

A minimal TanStack Start starter for vibecoding projects. The canonical repository lives at `github.com/codyde/template-tanstackstart`, so you can scaffold new apps from anywhere.

## Features
- TanStack Start with file-based routing and sensible defaults
- Tailwind CSS v4 with a light global theme
- Example server function that persists data to `todos.json`
- TypeScript, Vitest, React Testing Library, and Vite tooling preconfigured

## Quick Start

```bash
npx degit codyde/template-tanstackstart my-app
cd my-app
npm install
npm run dev
```

Or clone the GitHub repository directly:

```bash
git clone https://github.com/codyde/template-tanstackstart.git
cd template-tanstackstart
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## Explore the Template
- `src/routes/index.tsx`: clean landing page ready for customization.
- `src/routes/examples/server-functions.tsx`: working `createServerFn` todo example that writes to `todos.json`.
- `src/components/Header.tsx`: simple navigation scaffold you can extend with your own sections.
- `src/styles.css`: Tailwind entry point and base typography tweaks.

## Available Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local dev server on port 3000 |
| `npm run build` | Build the production bundle |
| `npm run serve` | Preview the production build locally |
| `npm run test` | Run Vitest in CI mode |

## Project Structure

```
src/
├── components/         # Shared UI building blocks
├── routes/             # File-based routes (index + examples/server-functions)
├── router.tsx          # Router instance wiring
└── styles.css          # Tailwind setup
```

## Customizing for Vibecoding
1. Start by adjusting `src/routes/index.tsx` with your product copy and layout.
2. Duplicate the server functions demo when you need new backend calls—each `createServerFn` lives next to the route that uses it.
3. Add more routes under `src/routes` and use `Link` from `@tanstack/react-router` for seamless navigation.

For full framework details, check out the [TanStack Start documentation](https://tanstack.com/start).
