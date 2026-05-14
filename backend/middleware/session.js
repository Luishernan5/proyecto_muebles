"use strict";

const { AppError } = require("../utils/errors");

function validateSesionId(sesionId) {
    if (!sesionId || typeof sesionId !== "string") {
        throw new AppError("sesion_id requerido", 400, "SESSION_REQUIRED");
    }
    const t = sesionId.trim();
    if (t.length < 8 || t.length > 100) {
        throw new AppError(
            "sesion_id inválido (entre 8 y 100 caracteres)",
            400,
            "SESSION_INVALID"
        );
    }
    return t;
}

/** Lee sesión desde header X-Session-Id o query sesion_id */
function sessionFromRequest(req) {
    const raw =
        req.headers["x-session-id"] ||
        req.headers["x-sesion-id"] ||
        req.query.sesion_id;
    return validateSesionId(String(raw || ""));
}

module.exports = { validateSesionId, sessionFromRequest };
