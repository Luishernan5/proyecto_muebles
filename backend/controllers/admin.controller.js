"use strict";

const adminStockService = require("../services/adminStock.service");
const { asyncHandler } = require("../utils/asyncHandler");

const ajustarStock = asyncHandler(async (req, res) => {
    const { id_producto, delta, comentario } = req.body || {};
    const data = await adminStockService.ajustarStock(
        id_producto,
        delta,
        comentario,
        req.usuario ? req.usuario.id_usuario : null
    );
    res.json({ ok: true, data });
});

module.exports = { ajustarStock };
