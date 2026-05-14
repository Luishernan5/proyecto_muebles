"use strict";

const categoriasService = require("../services/categorias.service");
const { asyncHandler } = require("../utils/asyncHandler");

const listar = asyncHandler(async (req, res) => {
    const data = await categoriasService.listar();
    res.json({ ok: true, data });
});

module.exports = { listar };
