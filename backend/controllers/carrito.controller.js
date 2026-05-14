"use strict";

const carritoService = require("../services/carrito.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sessionFromRequest } = require("../middleware/session");

function rolCarrito(req) {
    return req.usuario && req.usuario.rol === "admin" ? "admin" : "cliente";
}

const listar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.listarCarrito(sesionId, rolCarrito(req));
    res.json({ ok: true, data });
});

const agregar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const { id_producto, cantidad } = req.body || {};
    const data = await carritoService.agregarItem(
        sesionId,
        id_producto,
        cantidad != null ? cantidad : 1,
        rolCarrito(req)
    );
    res.status(201).json({ ok: true, data });
});

const actualizar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idCarrito = parseInt(req.params.idCarrito, 10);
    const { cantidad } = req.body || {};
    const data = await carritoService.actualizarCantidad(
        idCarrito,
        sesionId,
        cantidad,
        rolCarrito(req)
    );
    res.json({ ok: true, data });
});

const eliminar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idCarrito = parseInt(req.params.idCarrito, 10);
    const data = await carritoService.eliminarLinea(
        idCarrito,
        sesionId,
        rolCarrito(req)
    );
    res.json({ ok: true, data });
});

const vaciar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.vaciar(sesionId, rolCarrito(req));
    res.json({ ok: true, data });
});

const checkout = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idCliente =
        req.usuario && req.usuario.rol === "cliente"
            ? req.usuario.id_usuario
            : null;
    const result = await carritoService.checkout(sesionId, idCliente);
    res.json({ ok: true, data: result });
});

module.exports = { listar, agregar, actualizar, eliminar, vaciar, checkout };
