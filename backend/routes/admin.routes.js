"use strict";

const express = require("express");
const adminController = require("../controllers/admin.controller");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireAdmin);
router.post("/stock", adminController.ajustarStock);

module.exports = router;
