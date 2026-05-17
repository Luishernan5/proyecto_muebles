"use strict";

const express = require("express");
const authController = require("../controllers/auth.controller");
const { attachUserOptional } = require("../middleware/auth");

const router = express.Router();

router.post("/login", authController.loginCliente);
router.post("/login-admin", authController.loginAdmin);
router.post("/registro", authController.registro);
router.get("/public-config", authController.publicConfig);
router.get("/me", attachUserOptional, authController.me);

module.exports = router;
