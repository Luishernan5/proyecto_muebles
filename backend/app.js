"use strict";

const express = require("express");
const path = require("path");
const cors = require("cors");
const categoriasRoutes = require("./routes/categorias.routes");
const productosRoutes = require("./routes/productos.routes");
const carritoRoutes = require("./routes/carrito.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const { attachUserOptional } = require("./middleware/auth");
const healthController = require("./controllers/health.controller");
const { errorHandler, notFound } = require("./middleware/errorHandler");

function mapSqlError(err) {
    if (err && (err.code === "EREQUEST" || err.number)) {
        const num = err.number || err.originalError?.info?.number;
        if (num === 547) {
            return {
                status: 400,
                message: "No se pudo guardar: referencia inválida (FK).",
                code: "FK_VIOLATION",
            };
        }
        if (num === 2627 || num === 2601) {
            return {
                status: 409,
                message: "Conflicto de datos duplicados.",
                code: "DUPLICATE",
            };
        }
    }
    return null;
}

function errorHandlerWithSql(err, req, res, next) {
    const mapped = mapSqlError(err);
    if (mapped) {
        err = Object.assign(err, {
            statusCode: mapped.status,
            code: mapped.code,
            message: mapped.message,
            isOperational: true,
        });
    }
    return errorHandler(err, req, res, next);
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "512kb" }));

app.get("/api/health", healthController.ping);

app.use("/api/auth", authRoutes);
app.use("/api/admin", attachUserOptional, adminRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/carrito", attachUserOptional, carritoRoutes);

const frontendPath = path.join(__dirname, "..", "frontend");
/** Primera pantalla: acceso (la tienda sigue en /index.html). */
app.get("/", (req, res) => {
    res.redirect(302, "/pages/login.html");
});
app.use(express.static(frontendPath));

app.use(notFound);
app.use(errorHandlerWithSql);

module.exports = app;
