import { z } from "zod";

export function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(", ");
      return res.status(400).json({ error: msg });
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(", ");
      return res.status(400).json({ error: msg });
    }
    req.query = parsed.data;
    next();
  };
}
