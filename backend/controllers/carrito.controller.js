"use strict";

const carritoService = require("../services/carrito.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sessionFromRequest } = require("../middleware/session");
const PDFDocument = require("pdfkit");
const env = require("../config/env");
const { AppError } = require("../utils/errors");

function formatoPrecio(n) {
    return Number(n || 0).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function normalizarTelefonoWhatsApp(raw) {
    const base = String(raw || "").replace(/\D+/g, "");
    if (!base) {
        return "";
    }
    if (base.length === 10) {
        return `${env.whatsappDefaultCountryCode}${base}`;
    }
    if (base.length >= 11 && base.length <= 15) {
        return base;
    }
    return "";
}

function crearPdfRemisionBuffer(remision) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 36, size: "A4" });
        const chunks = [];
        const pageWidth = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const pageBottom = () => doc.page.height - doc.page.margins.bottom;
        const xLeft = () => doc.page.margins.left;
        const xRight = () => doc.page.width - doc.page.margins.right;
        const brandGreen = "#0f5132";
        const brandGold = "#c9a227";
        const ink = "#111827";
        const muted = "#6b7280";
        const border = "#d1d5db";

        function drawHeader() {
            const headerHeight = 86;
            const left = doc.page.margins.left;
            const top = doc.page.margins.top;

            doc.save();
            doc.rect(left, top, pageWidth(), headerHeight).fill(brandGreen);
            doc.rect(left, top + headerHeight - 8, pageWidth(), 8).fill(brandGold);
            doc.restore();

            doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("Punto Venta Muebles", left + 18, top + 18, {
                width: pageWidth() - 36,
                align: "center",
            });
            doc.fontSize(13).font("Helvetica").text("Nota de remisión", left + 18, top + 46, {
                width: pageWidth() - 36,
                align: "center",
            });

            doc.y = top + headerHeight + 18;
        }

        function drawInfoCard(rem) {
            const cardX = xLeft();
            const cardW = pageWidth();
            const cardH = 96;
            const cardY = doc.y;

            doc.save();
            doc.roundedRect(cardX, cardY, cardW, cardH, 10).fillAndStroke("#f8fafc", border);
            doc.restore();

            const leftColX = cardX + 18;
            const rightColX = cardX + cardW / 2 + 10;
            const baseY = cardY + 16;

            doc.fillColor(ink).font("Helvetica-Bold").fontSize(10);
            doc.text("Folio", leftColX, baseY);
            doc.text("Fecha", rightColX, baseY);

            doc.font("Helvetica").fontSize(11).fillColor(ink);
            doc.text(String(rem.id_pedido), leftColX, baseY + 14);
            doc.text(new Date(rem.fecha_pedido).toLocaleString("es-MX"), rightColX, baseY + 14);

            doc.font("Helvetica-Bold").fontSize(10).fillColor(ink);
            doc.text("Estado", leftColX, baseY + 40);
            doc.text("Artículos", rightColX, baseY + 40);

            doc.font("Helvetica").fontSize(11).fillColor(ink);
            doc.text(String(rem.estado || "completado"), leftColX, baseY + 54);
            doc.text(String((rem.items || []).length), rightColX, baseY + 54);

            doc.y = cardY + cardH + 18;
        }

        function drawTableHeader() {
            const tableX = xLeft();
            const tableW = pageWidth();
            const headerY = doc.y;
            const headerH = 24;

            doc.save();
            doc.roundedRect(tableX, headerY, tableW, headerH, 6).fill(brandGreen);
            doc.restore();

            doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
            doc.text("Cantidad", tableX + 10, headerY + 7, { width: 60, align: "center" });
            doc.text("Producto", tableX + 72, headerY + 7, { width: 250 });
            doc.text("P. Unit.", tableX + tableW - 152, headerY + 7, { width: 66, align: "right" });
            doc.text("Importe", tableX + tableW - 78, headerY + 7, { width: 68, align: "right" });

            doc.y = headerY + headerH + 4;
        }

        function drawItemRow(item, index) {
            const tableX = xLeft();
            const tableW = pageWidth();
            const rowH = 28;
            const gapBottom = 120;

            if (doc.y + rowH + gapBottom > pageBottom()) {
                doc.addPage();
                drawHeader();
                drawTableHeader();
            }

            const rowY = doc.y;
            const fill = index % 2 === 0 ? "#ffffff" : "#f9fafb";

            doc.save();
            doc.rect(tableX, rowY, tableW, rowH).fill(fill);
            doc.restore();

            doc.strokeColor(border).moveTo(tableX, rowY + rowH).lineTo(tableX + tableW, rowY + rowH).stroke();

            doc.fillColor(ink).font("Helvetica").fontSize(10);
            doc.text(String(item.cantidad), tableX + 10, rowY + 8, { width: 60, align: "center" });
            doc.text(item.nombre, tableX + 72, rowY + 8, { width: 250 });
            doc.text(`$${formatoPrecio(item.precio_unitario)} MXN`, tableX + tableW - 152, rowY + 8, { width: 66, align: "right" });
            doc.text(`$${formatoPrecio(item.importe)} MXN`, tableX + tableW - 78, rowY + 8, { width: 68, align: "right" });

            doc.y = rowY + rowH;
        }

        function drawTotals(rem) {
            const summaryW = 220;
            const summaryH = 96;
            const summaryX = xRight() - summaryW;
            const summaryY = doc.y + 18;

            if (summaryY + summaryH > pageBottom()) {
                doc.addPage();
                drawHeader();
                doc.y += 6;
            }

            doc.save();
            doc.roundedRect(summaryX, summaryY, summaryW, summaryH, 10).fillAndStroke("#f8fafc", border);
            doc.restore();

            const labelX = summaryX + 14;
            const valueX = summaryX + summaryW - 14;
            const row1Y = summaryY + 16;
            const rowGap = 20;

            doc.fillColor(muted).font("Helvetica").fontSize(10);
            doc.text("Subtotal", labelX, row1Y, { width: 120 });
            doc.text(`$${formatoPrecio(rem.subtotal)} MXN`, valueX - 100, row1Y, { width: 100, align: "right" });

            doc.text("IVA (16%)", labelX, row1Y + rowGap, { width: 120 });
            doc.text(`$${formatoPrecio(rem.iva)} MXN`, valueX - 100, row1Y + rowGap, { width: 100, align: "right" });

            doc.strokeColor(border).moveTo(summaryX + 12, row1Y + rowGap * 2 - 2).lineTo(summaryX + summaryW - 12, row1Y + rowGap * 2 - 2).stroke();

            doc.fillColor(brandGreen).font("Helvetica-Bold").fontSize(13);
            doc.text("Total", labelX, row1Y + rowGap * 2 + 6, { width: 120 });
            doc.text(`$${formatoPrecio(rem.total)} MXN`, valueX - 100, row1Y + rowGap * 2 + 6, { width: 100, align: "right" });

            doc.y = summaryY + summaryH + 14;
        }

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        drawHeader();
        drawInfoCard(remision);
        drawTableHeader();

        (remision.items || []).forEach((item, index) => {
            drawItemRow(item, index);
        });

        drawTotals(remision);

        doc.moveDown(1.1);
        doc.font("Helvetica").fontSize(9).fillColor(muted).text(
            "Gracias por tu compra. Conserva este comprobante para cualquier aclaración.",
            {
                align: "center",
            }
        );
        doc.moveDown(0.2);
        doc.text(`Documento generado el ${new Date().toLocaleString("es-MX")}`, {
            align: "center",
        });

        doc.end();
    });
}

async function enviarPdfPorWhatsApp({ telefono, pdfBuffer, filename, caption }) {
    if (!env.whatsappCloudApiToken || !env.whatsappCloudPhoneNumberId) {
        throw new AppError(
            "WhatsApp Cloud API no está configurado",
            501,
            "WHATSAPP_NOT_CONFIGURED"
        );
    }

    const mediaForm = new FormData();
    mediaForm.append("messaging_product", "whatsapp");
    mediaForm.append("type", "application/pdf");
    mediaForm.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const uploadResp = await fetch(
        `https://graph.facebook.com/${env.whatsappCloudApiVersion}/${env.whatsappCloudPhoneNumberId}/media`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.whatsappCloudApiToken}`,
            },
            body: mediaForm,
        }
    );
    const uploadBody = await uploadResp.json().catch(() => ({}));
    if (!uploadResp.ok || !uploadBody.id) {
        const msg = uploadBody.error && uploadBody.error.message ? uploadBody.error.message : "No se pudo subir el PDF a WhatsApp";
        throw new AppError(
            msg,
            uploadResp.status || 500,
            "WHATSAPP_MEDIA_UPLOAD_FAILED"
        );
    }

    const sendResp = await fetch(
        `https://graph.facebook.com/${env.whatsappCloudApiVersion}/${env.whatsappCloudPhoneNumberId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.whatsappCloudApiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: telefono,
                type: "document",
                document: {
                    id: uploadBody.id,
                    filename,
                    caption,
                },
            }),
        }
    );
    const sendBody = await sendResp.json().catch(() => ({}));
    if (!sendResp.ok) {
        const msg = sendBody.error && sendBody.error.message ? sendBody.error.message : "No se pudo enviar la nota por WhatsApp";
        throw new AppError(
            msg,
            sendResp.status || 500,
            "WHATSAPP_MESSAGE_FAILED"
        );
    }

    return {
        mediaId: uploadBody.id,
        response: sendBody,
    };
}

function rolCarrito(req) {
    return req.usuario && req.usuario.rol === "admin" ? "admin" : "cliente";
}

function responderConflictoInventario(res, err) {
    const status = Number(err && (err.statusCode || err.status));
    const code = String((err && err.code) || "");
    const esConflictoStock = status === 409;
    const esValidacionEsperada =
        status === 400 &&
        [
            "MAX_LINEA",
            "MAX_QUANTITY_EXCEEDED",
            "INVALID_QUANTITY",
            "ABASTO_STOCK_CAP",
            "INSUFFICIENT_STOCK",
        ].includes(code);

    if (err && (esConflictoStock || esValidacionEsperada)) {
        res.status(200).json({
            ok: false,
            error: {
                message: err.message || "Conflicto de inventario",
                code: err.code || "INVENTORY_CONFLICT",
                meta: err.meta || null,
            },
        });
        return true;
    }

    return false;
}

const listar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.listarCarrito(sesionId, rolCarrito(req));
    res.json({ ok: true, data });
});

const agregar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const { id_producto, cantidad } = req.body || {};
    try {
        const data = await carritoService.agregarItem(
            sesionId,
            id_producto,
            cantidad != null ? cantidad : 1,
            rolCarrito(req)
        );
        res.status(201).json({ ok: true, data });
    } catch (err) {
        if (responderConflictoInventario(res, err)) {
            return;
        }
        throw err;
    }
});

const actualizar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idCarrito = parseInt(req.params.idCarrito, 10);
    const { cantidad } = req.body || {};
    try {
        const data = await carritoService.actualizarCantidad(
            idCarrito,
            sesionId,
            cantidad,
            rolCarrito(req)
        );
        res.json({ ok: true, data });
    } catch (err) {
        if (responderConflictoInventario(res, err)) {
            return;
        }
        throw err;
    }
});

const eliminar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idCarrito = parseInt(req.params.idCarrito, 10);
    const data = await carritoService.eliminarLinea(
        idCarrito,
        sesionId,
        rolCarrito(req)
    );
    res.json({ ok: true, data });
});

const vaciar = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.vaciar(sesionId, rolCarrito(req));
    res.json({ ok: true, data });
});

/** Venta: invitado o cliente (descuenta inventario). */
const checkoutCompra = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const data = await carritoService.checkoutCompra(
        sesionId,
        req.usuario || null
    );
    res.json({ ok: true, data });
});

/** Abasto: solo administrador (incrementa inventario). */
const checkoutAbasto = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    
    if (!req.usuario) {
        return res.status(403).json({
            ok: false,
            error: {
                message: "Autenticación requerida para abasto",
                code: "AUTH_REQUIRED"
            }
        });
    }

    if (req.usuario.rol !== "admin") {
        return res.status(403).json({
            ok: false,
            error: {
                message: "Permiso denegado: solo administradores pueden registrar abasto",
                code: "ADMIN_ONLY"
            }
        });
    }

    const data = await carritoService.checkoutAbasto(
        sesionId,
        req.usuario.id_usuario
    );
    res.json({ ok: true, data });
});

/**
 * Compatibilidad: despacha según rol (admin → abasto, resto → compra).
 * Preferible usar POST /compra o POST /abasto de forma explícita.
 */
const checkoutLegacy = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    if (req.usuario && req.usuario.rol === "admin") {
        const data = await carritoService.checkoutAbasto(
            sesionId,
            req.usuario.id_usuario
        );
        return res.json({ ok: true, data });
    }
    const data = await carritoService.checkoutCompra(
        sesionId,
        req.usuario || null
    );
    res.json({ ok: true, data });
});

const remisionPdf = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idPedido = req.params.idPedido;
    const remision = await carritoService.obtenerRemisionPedido(idPedido, sesionId);
    const filename = `remision-pedido-${remision.id_pedido}.pdf`;
    const pdfBuffer = await crearPdfRemisionBuffer(remision);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.end(pdfBuffer);
});

const remisionWhatsApp = asyncHandler(async (req, res) => {
    const sesionId = sessionFromRequest(req);
    const idPedido = req.params.idPedido;
    const telefono = normalizarTelefonoWhatsApp(
        (req.body && req.body.telefono) || env.whatsappDefaultRecipientNumber || ""
    );

    if (!telefono) {
        return res.status(400).json({
            ok: false,
            error: {
                message: "Ingresa un número de teléfono válido con lada.",
                code: "INVALID_PHONE",
            },
        });
    }

    const remision = await carritoService.obtenerRemisionPedido(idPedido, sesionId);
    const filename = `remision-pedido-${remision.id_pedido}.pdf`;
    const pdfBuffer = await crearPdfRemisionBuffer(remision);
    const caption = `Nota de remisión #${remision.id_pedido} | IVA 16% | Total $${formatoPrecio(remision.total)} MXN`;

    const result = await enviarPdfPorWhatsApp({
        telefono,
        pdfBuffer,
        filename,
        caption,
    });

    res.json({
        ok: true,
        data: {
            id_pedido: remision.id_pedido,
            telefono,
            media_id: result.mediaId,
            message: "La nota de remisión se envió por WhatsApp.",
        },
    });
});



const remisionCorreo = asyncHandler(async (req, res) => {
    const idPedido = parseInt(req.params.idPedido, 10);
    const email = String(req.body?.email || '').trim();

    if (!idPedido || idPedido < 1) {
        throw new AppError('ID de pedido inv�lido', 400);
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError('Email inv�lido', 400);
    }

    const sesionId = sessionFromRequest(req);
    const remision = await carritoService.obtenerRemisionPedido(idPedido, sesionId);
    const pdfBuffer = await crearPdfRemisionBuffer(remision);

    const { enviarRemisionPorEmail } = require('../services/email.service');
    const result = await enviarRemisionPorEmail(email, pdfBuffer, idPedido, remision);

    res.json({
        ok: true,
        data: {
            id_pedido: remision.id_pedido,
            email,
            messageId: result.messageId,
            message: 'La nota de remisi�n fue enviada por correo.',
        },
    });
});

const cancelarPedidoRemision = asyncHandler(async (req, res) => {
    const idPedido = parseInt(req.params.idPedido, 10);
    if (!idPedido || idPedido < 1) {
        throw new AppError('ID de pedido inv�lido', 400);
    }

    const sesionId = sessionFromRequest(req);
    const result = await carritoService.cancelarPedido(idPedido, sesionId);

    res.json({
        ok: true,
        data: result,
    });
});

module.exports = {
    listar,
    agregar,
    actualizar,
    eliminar,
    vaciar,
    checkoutCompra,
    checkoutAbasto,
    checkoutLegacy,
    remisionPdf,
    remisionCorreo,
    cancelarPedidoRemision,
    remisionWhatsApp,
};


