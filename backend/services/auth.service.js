"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");
const env = require("../config/env");

async function login(email, password) {
    const e = String(email || "")
        .trim()
        .toLowerCase();
    if (!e || !password) {
        throw new AppError("Email y contraseña son obligatorios", 400, "INVALID_INPUT");
    }
    if (!env.jwtSecret) {
        throw new AppError(
            "Servidor sin JWT_SECRET configurado",
            500,
            "SERVER_MISCONFIGURED"
        );
    }

    const pool = await getPool();
    const r = await pool
        .request()
        .input("email", sql.NVarChar(255), e)
        .query(
            `SELECT id_usuario, nombre, email, [contraseña] AS contrasena_hash, rol, activo
       FROM Usuarios WHERE LOWER(LTRIM(RTRIM(email))) = @email`
        );
    const row = r.recordset[0];
    if (!row || !row.activo) {
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }
    const ok = await bcrypt.compare(String(password), String(row.contrasena_hash));
    if (!ok) {
        throw new AppError("Credenciales incorrectas", 401, "INVALID_CREDENTIALS");
    }

    const rol = String(row.rol || "").toLowerCase();
    const token = jwt.sign(
        {
            sub: String(row.id_usuario),
            rol,
            email: row.email,
            nombre: row.nombre || "",
        },
        env.jwtSecret,
        { expiresIn: env.jwtExpiresIn }
    );

    return {
        token,
        usuario: {
            id_usuario: Number(row.id_usuario),
            nombre: row.nombre || "",
            email: row.email,
            rol,
        },
    };
}

async function registroCliente(nombre, email, password) {
    const n = String(nombre || "").trim();
    const e = String(email || "")
        .trim()
        .toLowerCase();
    if (!n || n.length < 2) {
        throw new AppError("Nombre inválido (mínimo 2 caracteres)", 400, "INVALID_NAME");
    }
    if (!e || !e.includes("@")) {
        throw new AppError("Correo inválido", 400, "INVALID_EMAIL");
    }
    const pwd = String(password || "");
    if (pwd.length < 6) {
        throw new AppError("La contraseña debe tener al menos 6 caracteres", 400, "INVALID_PASSWORD");
    }

    const pool = await getPool();
    const dup = await pool
        .request()
        .input("email", sql.NVarChar(255), e)
        .query("SELECT 1 AS x FROM Usuarios WHERE LOWER(LTRIM(RTRIM(email))) = @email");
    if (dup.recordset.length) {
        throw new AppError("Ese correo ya está registrado", 409, "EMAIL_IN_USE");
    }

    const hash = await bcrypt.hash(pwd, 10);
    await pool
        .request()
        .input("nombre", sql.NVarChar(100), n)
        .input("email", sql.NVarChar(255), e)
        .input("hash", sql.NVarChar(255), hash)
        .query(
            `INSERT INTO Usuarios (nombre, email, [contraseña], rol)
       VALUES (@nombre, @email, @hash, N'cliente')`
        );

    return login(e, pwd);
}

module.exports = { login, registroCliente };
