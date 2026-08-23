import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the Replit reverse proxy (one hop) so req.protocol and req.hostname
// reflect the original request rather than the internal proxy hop.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: tighten to APP_ORIGIN when provided, otherwise same-origin only
const appOrigin = process.env.APP_ORIGIN;
app.use(
  cors({
    origin: appOrigin ?? false,
    credentials: true,
  }),
);

// Meta signs the exact request bytes. Parse only this narrow endpoint as raw
// before the global JSON parser so the webhook handler can verify its HMAC.
app.use(
  "/api/meta/webhook",
  express.raw({ type: "application/json", limit: "128kb" }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
