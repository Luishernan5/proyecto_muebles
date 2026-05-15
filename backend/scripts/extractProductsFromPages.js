"use strict";

const fs = require("fs");
const path = require("path");

const pagesRoot = path.join(__dirname, "..", "..", "frontend", "pages");

function walk(dir) {
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out = out.concat(walk(p));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
            out.push(p);
        }
    }
    return out;
}

function categoryFromFile(filePath) {
    const p = filePath.toLowerCase();
    if (p.includes("\\camas\\")) return "Camas";
    if (p.includes("\\comedor\\")) return "Comedor";
    return "Muebles";
}

function normalize(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
}

function parseProducts(html, filePath) {
    const rows = [];
    const cardRegex = /<div[^>]*class="[^"]*producto-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
        const block = match[1];

        const nameMatch = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
        const priceMatch = block.match(/<h3[^>]*class="precio"[^>]*>\$\s*([\d,]+)\s*MXN<\/h3>/i);
        const idMatch = block.match(/onclick="agregarCarrito\((\d+)\)"/i);
        const imgMatch = block.match(/<img\s+src="([^"]+)"/i);

        if (!nameMatch || !priceMatch || !idMatch) {
            continue;
        }

        rows.push({
            id: Number(idMatch[1]),
            nombre: normalize(nameMatch[1].replace(/<[^>]+>/g, " ")),
            precio: Number(String(priceMatch[1]).replace(/,/g, "")),
            imagen: imgMatch ? normalize(imgMatch[1]) : null,
            categoria: categoryFromFile(filePath),
            file: filePath,
        });
    }

    return rows;
}

function main() {
    const files = walk(pagesRoot);
    const byId = new Map();
    const conflicts = [];

    for (const file of files) {
        const html = fs.readFileSync(file, "utf8");
        const rows = parseProducts(html, file);

        for (const r of rows) {
            if (!byId.has(r.id)) {
                byId.set(r.id, r);
                continue;
            }
            const prev = byId.get(r.id);
            if (prev.nombre !== r.nombre || prev.precio !== r.precio) {
                conflicts.push({ id: r.id, prev, current: r });
            }
        }
    }

    const ids = Array.from(byId.keys()).sort((a, b) => a - b);
    const max = ids.length ? ids[ids.length - 1] : 0;
    const missing = [];
    for (let i = 1; i <= max; i += 1) {
        if (!byId.has(i)) missing.push(i);
    }

    const out = ids.map((id) => byId.get(id));
    const outPath = path.join(__dirname, "..", "database", "_extracted_products.json");
    fs.writeFileSync(outPath, JSON.stringify({ products: out, conflicts, missing }, null, 2), "utf8");

    console.log("Productos extraidos:", out.length);
    console.log("Rango IDs:", ids[0], "..", ids[ids.length - 1]);
    console.log("IDs faltantes:", missing.length ? missing.join(",") : "ninguno");
    console.log("Conflictos de ID:", conflicts.length);
    console.log("Archivo:", outPath);
}

main();
