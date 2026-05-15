"use strict";

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const status = err.statusCode || 500;
    const code = err.code || "INTERNAL";
    const isProd =
        String(process.env.NODE_ENV || "").toLowerCase() === "production";
    const message =
        status === 500 && !err.isOperational
            ? "Error interno del servidor"
            : err.message || "Error";

    if (status === 500) {
        console.error("[API]", err);
    }

    const payload = {
        ok: false,
        error: { code, message },
    };

    if (!isProd && err.meta) {
        payload.error.meta = err.meta;
    }

    res.status(status).json(payload);
}

function notFound(req, res) {
    res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Ruta no encontrada" },
    });
}

module.exports = { errorHandler, notFound };
