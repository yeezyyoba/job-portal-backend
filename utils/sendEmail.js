// utils/sendEmail.js
const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text, html }) => {
  // If SMTP variables are set in env, use real email transport
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || 'JobPortal'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html
      });
      console.log(`Email sent successfully to ${to}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('SMTP sending failed, falling back to console:', error.message);
    }
  }

  // Fallback / Development mode logging
  console.log('\n========================================');
  console.log('=== DEVELOPMENT EMAIL SENT (Nodemailer Fallback) ===');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Text:    ${text}`);
  console.log('========================================\n');
  return true;
};

module.exports = sendEmail;
