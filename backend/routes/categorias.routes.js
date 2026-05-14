"use strict";

const express = require("express");
const categoriasController = require("../controllers/categorias.controller");

const router = express.Router();

router.get("/", categoriasController.listar);

module.exports = router;
