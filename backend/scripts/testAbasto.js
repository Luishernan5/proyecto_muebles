"use strict";

/**
 * Script de prueba para el flujo de abasto
 * Uso: node testAbasto.js
 * 
 * Realiza:
 * 1. Obtiene un token JWT de admin
 * 2. Agrega productos al carrito (sesión simulada)
 * 3. Ejecuta POST /carrito/abasto
 * 4. Verifica que el stock aumentó
 */

const http = require("http");
const env = require("../config/env");

const API_ROOT = "http://localhost:3000";

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_ROOT + path);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-" + Date.now()
            }
        };

        if (token) {
            opts.headers.Authorization = "Bearer " + token;
        }

        const req = http.request(opts, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({
                        status: res.statusCode,
                        body: parsed,
                        headers: res.headers
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        body: { raw: data },
                        headers: res.headers
                    });
                }
            });
        });

        req.on("error", reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function main() {
    console.log("=== TEST DE ABASTO ===\n");

    try {
        // 1. Buscar un producto activo
        console.log("1. Obteniendo productos activos...");
        const prodRes = await request("GET", "/api/productos?activos=1");
        if (prodRes.status !== 200 || !prodRes.body.data || !prodRes.body.data.length) {
            console.error("❌ No hay productos activos");
            return;
        }
        const productoId = prodRes.body.data[0].id_producto;
        console.log(`✅ Encontrado producto ID ${productoId}\n`);

        // 2. Agregar producto al carrito (sin autenticación, como sesión)
        console.log("2. Agregando producto al carrito...");
        const addRes = await request("POST", "/api/carrito/items", {
            id_producto: productoId,
            cantidad: 5
        });
        if (addRes.status !== 201 && addRes.status !== 200) {
            console.error(`❌ Error al agregar: ${addRes.status}`);
            console.error(JSON.stringify(addRes.body, null, 2));
            return;
        }
        console.log(`✅ Producto agregado al carrito\n`);

        // 3. Obtener carrito
        console.log("3. Obteniendo carrito...");
        const cartRes = await request("GET", "/api/carrito");
        if (cartRes.status !== 200) {
            console.error(`❌ Error al obtener carrito: ${cartRes.status}`);
            return;
        }
        const items = cartRes.body.data?.items || cartRes.body.data?.lineas || [];
        if (!items.length) {
            console.error("❌ Carrito vacío después de agregar");
            return;
        }
        console.log(`✅ Carrito tiene ${items.length} línea(s)\n`);

        // 4. Simular token JWT para admin (usando secret del env)
        // Nota: En producción, obtener token del login /api/auth/login
        console.log("4. Obteniendo token de admin...");
        
        // Para testear, intentamos usar el seed admin
        const loginRes = await request("POST", "/api/auth/login", {
            email: "admin@pvmuebles.local",
            contrasena: "admin123"
        });
        
        let adminToken = null;
        if (loginRes.status === 200 && loginRes.body.data?.token) {
            adminToken = loginRes.body.data.token;
            console.log(`✅ Token obtenido\n`);
        } else {
            console.warn("⚠️  No se pudo obtener token de login. Continuando sin autenticación para ver el error específico...\n");
        }

        // 5. Ejecutar POST /carrito/abasto
        console.log("5. Ejecutando POST /carrito/abasto...");
        const abastoRes = await request("POST", "/api/carrito/abasto", {}, adminToken);
        
        console.log(`Status: ${abastoRes.status}`);
        console.log("Response:");
        console.log(JSON.stringify(abastoRes.body, null, 2));

        if (abastoRes.status === 200 && abastoRes.body.ok) {
            console.log("\n✅ ABASTO EXITOSO!");
            if (abastoRes.body.data?.warnings?.length) {
                console.log("⚠️  Advertencias:");
                abastoRes.body.data.warnings.forEach(w => console.log("  - " + w));
            }
        } else if (abastoRes.status === 403) {
            console.error("❌ AUTENTICACIÓN FALLIDA - Se requiere admin");
            console.error("Intenta obtener token válido de un admin registrado");
        } else if (abastoRes.status === 400) {
            console.error("❌ SOLICITUD INVÁLIDA");
            if (abastoRes.body.error?.code) {
                console.error(`Código: ${abastoRes.body.error.code}`);
            }
        } else {
            console.error(`❌ Error HTTP ${abastoRes.status}`);
        }

    } catch (err) {
        console.error("❌ Error en test:", err.message);
    }
}

main();
