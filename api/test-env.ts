import { Hono } from "hono";
const app = new Hono<{ Bindings: { VITE_OPENROUTER1_API_KEY: string } }>();
app.get("/", (c) => c.text(c.env.VITE_OPENROUTER1_API_KEY ? "KEY EXISTS" : "KEY MISSING"));
export default app;
