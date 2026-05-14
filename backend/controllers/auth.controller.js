"use strict";

const authService = require("../services/auth.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/errors");

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const data = await authService.login(email, password);
    res.json({ ok: true, data });
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

module.exports = { login, registro, me };
