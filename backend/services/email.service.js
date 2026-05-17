const nodemailer = require("nodemailer");
const { envConfig } = require("../config/env");

if (!envConfig.gmailUser || !envConfig.gmailAppPassword) {
    throw new Error(
        "Falta configurar GMAIL_USER y GMAIL_APP_PASSWORD en backend/.env para enviar remisiones por correo."
    );
}

// Configurar transportador de Nodemailer para Gmail
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: envConfig.gmailUser,
        pass: envConfig.gmailAppPassword,
    },
});

/**
 * Enviar nota de remisión por correo
 * @param {string} destinatarioEmail - Email del cliente
 * @param {Buffer} pdfBuffer - Buffer del PDF
 * @param {number} idPedido - ID del pedido
 * @param {object} detalles - Detalles del pedido (opcional, para incluir en el correo)
 * @returns {Promise<object>} Respuesta de envío
 */
async function enviarRemisionPorEmail(destinatarioEmail, pdfBuffer, idPedido, detalles = {}) {
    try {
        const mailOptions = {
            from: `"${envConfig.gmailFromName}" <${envConfig.gmailUser}>`,
            to: destinatarioEmail,
            subject: `Nota de Remisión #${idPedido} - ${envConfig.gmailFromName}`,
            html: `
                <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { color: #1a7f1a; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
                            .content { line-height: 1.6; margin-bottom: 20px; }
                            .footer { font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">Nota de Remisión de Muebles</div>
                            <div class="content">
                                <p>Estimado cliente,</p>
                                <p>Adjunto encontrará la nota de remisión correspondiente a su pedido <strong>#${idPedido}</strong>.</p>
                                <p>Esta nota contiene los detalles de los productos adquiridos, cantidades, precios e impuestos.</p>
                                <p>Si tiene alguna duda, no dude en contactarnos.</p>
                            </div>
                            <div class="footer">
                                <p><strong>${envConfig.gmailFromName}</strong></p>
                                <p>Este es un correo automático, por favor no responda a esta dirección.</p>
                            </div>
                        </div>
                    </body>
                </html>
            `,
            attachments: [
                {
                    filename: `nota-remision-${idPedido}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ],
        };

        const resultado = await transporter.sendMail(mailOptions);
        return {
            success: true,
            messageId: resultado.messageId,
            email: destinatarioEmail,
        };
    } catch (error) {
        console.error("Error al enviar email:", error);
        throw new Error(`No se pudo enviar el correo: ${error.message}`);
    }
}

module.exports = {
    enviarRemisionPorEmail,
};
