"use strict";

require("dotenv").config({
    path: require("path").join(__dirname, "..", ".env"),
});

const bcrypt = require("bcryptjs");
const { sql, getPool } = require("../config/database");

async function main() {
    const email = String(
        process.env.SEED_ADMIN_EMAIL || "admin@local"
    )
        .trim()
        .toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || "admin123";

    const pool = await getPool();
    const check = await pool
        .request()
        .input("email", sql.NVarChar(255), email)
        .query(
            "SELECT id_usuario FROM Usuarios WHERE LOWER(LTRIM(RTRIM(email))) = @email"
        );
    if (check.recordset.length) {
        console.log("Ya existe un usuario con email:", email);
        process.exit(0);
        return;
    }

    const hash = await bcrypt.hash(password, 10);
    await pool
        .request()
        .input("nombre", sql.NVarChar(100), "Administrador")
        .input("email", sql.NVarChar(255), email)
        .input("hash", sql.NVarChar(255), hash)
        .query(
            `INSERT INTO Usuarios (nombre, email, [contraseña], rol)
       VALUES (@nombre, @email, @hash, N'admin')`
        );

    console.log("Administrador creado:", email);
    console.log("(Cambia la contraseña en producción.)");
}

main().catch(function (e) {
    console.error(e);
    process.exit(1);
});
