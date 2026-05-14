"use strict";

const express = require("express");
const carritoController = require("../controllers/carrito.controller");

const router = express.Router();

router.get("/", carritoController.listar);
router.post("/items", carritoController.agregar);
router.patch("/items/:idCarrito", carritoController.actualizar);
router.delete("/items/:idCarrito", carritoController.eliminar);
router.delete("/", carritoController.vaciar);
router.post("/checkout", carritoController.checkout);

module.exports = router;
