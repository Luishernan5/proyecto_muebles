"use strict";

const express = require("express");
const authController = require("../controllers/auth.controller");
const { attachUserOptional } = require("../middleware/auth");

const router = express.Router();

router.post("/login", authController.login);
router.post("/registro", authController.registro);
router.get("/me", attachUserOptional, authController.me);

module.exports = router;
