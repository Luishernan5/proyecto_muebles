"use strict";

const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { AppError } = require("../utils/errors");

/**
 * Si viene Authorization: Bearer <jwt>, valida y asigna req.usuario = { id_usuario, rol, email, nombre }.
 */
function attachUserOptional(req, res, next) {
    req.usuario = null;
    const h = req.headers.authorization;
    if (!h || typeof h !== "string") {
        return next();
    }
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m || !m[1]) {
        return next();
    }
    if (!env.jwtSecret) {
        return next();
    }
    try {
        const p = jwt.verify(m[1].trim(), env.jwtSecret);
        const rol = String(p.rol || "").toLowerCase();
        if (
            (rol === "admin" || rol === "cliente") &&
            p.sub != null &&
            !Number.isNaN(parseInt(p.sub, 10))
        ) {
            req.usuario = {
                id_usuario: parseInt(p.sub, 10),
                rol,
                email: typeof p.email === "string" ? p.email : "",
                nombre: typeof p.nombre === "string" ? p.nombre : "",
            };
        }
    } catch (e) {
        /* ignorar token caducado o mal firmado */
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.usuario || req.usuario.rol !== "admin") {
        return next(
            new AppError(
                "Se requiere cuenta de administrador",
                403,
                "FORBIDDEN"
            )
        );
    }
    next();
}

module.exports = { attachUserOptional, requireAdmin };
