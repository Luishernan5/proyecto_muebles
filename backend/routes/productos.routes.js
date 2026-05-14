"use strict";

const express = require("express");
const productosController = require("../controllers/productos.controller");

const router = express.Router();

router.get("/", productosController.listar);
router.get("/:id", productosController.obtenerPorId);

module.exports = router;
