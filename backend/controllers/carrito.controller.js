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

/** Venta: invitado o cliente (descuenta inventario). */
const checkoutCompra = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.checkoutCompra(
        sesionId,
        req.usuario || null
    );
    res.json({ ok: true, data });
});

/** Abasto: solo administrador (incrementa inventario). */
const checkoutAbasto = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    
    if (!req.usuario) {
        return res.status(403).json({
            ok: false,
            error: {
                message: "Autenticación requerida para abasto",
                code: "AUTH_REQUIRED"
            }
        });
    }

    if (req.usuario.rol !== "admin") {
        return res.status(403).json({
            ok: false,
            error: {
                message: "Permiso denegado: solo administradores pueden registrar abasto",
                code: "ADMIN_ONLY"
            }
        });
    }

    const data = await carritoService.checkoutAbasto(
        sesionId,
        req.usuario.id_usuario
    );
    res.json({ ok: true, data });
});

/**
 * Compatibilidad: despacha según rol (admin → abasto, resto → compra).
 * Preferible usar POST /compra o POST /abasto de forma explícita.
 */
const checkoutLegacy = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    if (req.usuario && req.usuario.rol === "admin") {
        const data = await carritoService.checkoutAbasto(
            sesionId,
            req.usuario.id_usuario
        );
        return res.json({ ok: true, data });
    }
    const data = await carritoService.checkoutCompra(
        sesionId,
        req.usuario || null
    );
    res.json({ ok: true, data });
});

module.exports = {
    listar,
    agregar,
    actualizar,
    eliminar,
    vaciar,
    checkoutCompra,
    checkoutAbasto,
    checkoutLegacy,
};
