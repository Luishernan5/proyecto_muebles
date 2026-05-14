"use strict";

const { getPool } = require("../config/database");
const { asyncHandler } = require("../utils/asyncHandler");

const ping = asyncHandler(async (req, res) => {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");
    res.json({ ok: true, message: "API y base de datos respondiendo" });
});

module.exports = { ping };
