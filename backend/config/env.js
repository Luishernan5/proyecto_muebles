"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const toBool = (v, def) => {
    if (v === undefined || v === "") return def;
    return String(v).toLowerCase() === "true" || v === "1";
};

const isProd =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";

/** En desarrollo, si falta JWT_SECRET, se usa un valor fijo (no usar en producción). */
let jwtSecret = String(process.env.JWT_SECRET || "").trim();
if (!jwtSecret) {
    if (isProd) {
        jwtSecret = "";
    } else {
        jwtSecret =
            "pvm-dev-solo-no-produccion-definir-JWT_SECRET-en-archivo-env";
        if (!global.__pvmJwtDevWarn) {
            global.__pvmJwtDevWarn = true;
            console.warn(
                "[PVM] JWT_SECRET no está en .env: usando clave solo para desarrollo. " +
                    "Añade JWT_SECRET antes de desplegar a producción."
            );
        }
    }
}

module.exports = {
    port: parseInt(process.env.PORT || "3000", 10),
    db: {
        server: process.env.DB_SERVER || "HERNAN05",
        user: process.env.DB_USER || "sa",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_DATABASE || "PuntoVentaMuebles",
        options: {
            encrypt: toBool(process.env.DB_ENCRYPT, false),
            trustServerCertificate: toBool(
                process.env.DB_TRUST_SERVER_CERTIFICATE,
                true
            ),
        },
    },
    stockMin: parseInt(process.env.STOCK_MIN || "1", 10),
    /** Máximo de unidades por producto en carrito (visitante o cliente). */
    cartMaxClient: parseInt(
        process.env.CART_MAX_CLIENT || process.env.STOCK_MAX || "30",
        10
    ),
    /** Máximo en carrito para sesión autenticada como administrador. */
    cartMaxAdmin: parseInt(process.env.CART_MAX_ADMIN || "500", 10),
    /** @deprecated usar cartMaxClient; se mantiene por compatibilidad. */
    stockMax: parseInt(
        process.env.CART_MAX_CLIENT || process.env.STOCK_MAX || "30",
        10
    ),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
};
