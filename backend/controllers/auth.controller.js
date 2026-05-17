"use strict";

const authService = require("../services/auth.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/errors");
const env = require("../config/env");

function responderLoginError(res, err) {
    if (err && err.isOperational) {
        return res.status(200).json({
            ok: false,
            error: {
                code: err.code || "AUTH_ERROR",
                message: err.message || "No se pudo iniciar sesión",
            },
        });
    }
    throw err;
}

const loginCliente = asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    try {
        const data = await authService.login(email, password, "cliente");
        res.json({ ok: true, data });
    } catch (err) {
        return responderLoginError(res, err);
    }
});

const loginAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    try {
        const data = await authService.login(email, password, "admin");
        res.json({ ok: true, data });
    } catch (err) {
        return responderLoginError(res, err);
    }
});

const registro = asyncHandler(async (req, res) => {
    const { nombre, email, password } = req.body || {};
    const data = await authService.registroCliente(nombre, email, password);
    res.status(201).json({ ok: true, data });
});

const me = asyncHandler(async (req, res) => {
    if (!req.usuario) {
        throw new AppError("No autenticado", 401, "UNAUTHORIZED");
    }
    res.json({
        ok: true,
        data: {
            id_usuario: req.usuario.id_usuario,
            nombre: req.usuario.nombre,
            email: req.usuario.email,
            rol: req.usuario.rol,
        },
    });
});

const publicConfig = asyncHandler(async (req, res) => {
    res.json({
        ok: true,
        data: {
            whatsappDefaultRecipientFixed: Boolean(
                String(env.whatsappDefaultRecipientNumber || "").trim()
            ),
        },
    });
});

module.exports = { loginCliente, loginAdmin, registro, me, publicConfig };
