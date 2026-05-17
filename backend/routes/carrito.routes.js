"use strict";

const express = require("express");
const carritoController = require("../controllers/carrito.controller");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", carritoController.listar);
router.post("/items", carritoController.agregar);
router.patch("/items/:idCarrito", carritoController.actualizar);
router.delete("/items/:idCarrito", carritoController.eliminar);
router.delete("/", carritoController.vaciar);
router.post("/compra", carritoController.checkoutCompra);
router.post("/abasto", requireAdmin, carritoController.checkoutAbasto);
router.post("/checkout", carritoController.checkoutLegacy);
router.get("/remision/:idPedido/pdf", carritoController.remisionPdf);
router.post("/remision/:idPedido/email", carritoController.remisionCorreo);
router.post("/remision/:idPedido/cancelar", carritoController.cancelarPedidoRemision);
router.post("/remision/:idPedido/whatsapp", carritoController.remisionWhatsApp);

module.exports = router;

