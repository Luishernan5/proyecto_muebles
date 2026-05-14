"use strict";

const productosService = require("../services/productos.service");
const { asyncHandler } = require("../utils/asyncHandler");

const listar = asyncHandler(async (req, res) => {
    const data = await productosService.listar({
        idCategoria: req.query.id_categoria,
    });
    res.json({ ok: true, data });
});

const obtenerPorId = asyncHandler(async (req, res) => {
    const data = await productosService.obtenerPorId(req.params.id);
    res.json({ ok: true, data });
});

module.exports = { listar, obtenerPorId };
