// controllers/contactController.js
const { query, get, run } = require('../config/db');
const sendEmail = require('../utils/sendEmail');

// @desc    Handle contact form submission
// @route   POST /api/contact
// @access  Public
const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      res.statusCode = 400;
      throw new Error('Please fill in all fields (name, email, subject, message)');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' });
    const dateStr = new Date().toISOString().split('T')[0];

    // 1. Send acknowledgment email to the user
    await sendEmail({
      to: normalizedEmail,
      subject: `We received your message: "${subject}"`,
      text: `Hi ${name},\n\nThank you for reaching out to JobPortal. We have received your message regarding "${subject}" and our team will get back to you within 1-2 business days.\n\nYour message:\n${message}\n\nBest regards,\nJobPortal Support Team`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4F46E5; margin-top: 0;">Thank You for Contacting Us</h2>
          <p>Hi <strong>${name}</strong>,</p>
          <p>We have received your message regarding <strong>"${subject}"</strong> and our team will get back to you within <strong>1-2 business days</strong>.</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4F46E5;">
            <p style="margin: 0; font-size: 0.9rem; color: #374151;"><strong>Your message:</strong></p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #6b7280; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br/>JobPortal Support Team</p>
        </div>
      `
    });

    // 2. Send the message to all admins and superadmins (email + in-app notification)
    const admins = await query(
      "SELECT email, notifications FROM users WHERE role IN ('admin', 'superadmin') AND emailVerified = 1"
    );

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        // Send email notification
        await sendEmail({
          to: admin.email,
          subject: `[Contact Form] ${subject} — from ${name}`,
          text: `New contact form submission:\n\nFrom: ${name} (${normalizedEmail})\nSubject: ${subject}\nDate: ${timestamp}\n\nMessage:\n${message}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
              <h2 style="color: #DC2626; margin-top: 0;">📬 New Contact Form Submission</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem;">
                <tr>
                  <td style="padding: 8px; font-weight: 600; color: #374151; width: 100px;">From:</td>
                  <td style="padding: 8px; color: #6b7280;">${name} (<a href="mailto:${normalizedEmail}">${normalizedEmail}</a>)</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: 600; color: #374151;">Subject:</td>
                  <td style="padding: 8px; color: #6b7280;">${subject}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: 600; color: #374151;">Date:</td>
                  <td style="padding: 8px; color: #6b7280;">${timestamp}</td>
                </tr>
              </table>
              <div style="background-color: #FEF2F2; padding: 15px; border-radius: 5px; border-left: 4px solid #DC2626;">
                <p style="margin: 0; font-size: 0.9rem; color: #374151;"><strong>Message:</strong></p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #6b7280; white-space: pre-wrap;">${message}</p>
              </div>
              <p style="color: #9CA3AF; font-size: 12px; margin-top: 1.5rem;">This email was sent automatically from the JobPortal Contact Form.</p>
            </div>
          `
        });

        // Push in-app notification
        let existingNotifs = [];
        try {
          existingNotifs = JSON.parse(admin.notifications || '[]');
        } catch (e) {
          existingNotifs = [];
        }

        const newNotif = {
          id: 'contact-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          title: `📬 Contact: ${subject}`,
          message: `From ${name} (${normalizedEmail}): ${message}`,
          date: dateStr,
          read: false
        };

        existingNotifs.unshift(newNotif);
        await run(
          'UPDATE users SET notifications = ? WHERE email = ?',
          [JSON.stringify(existingNotifs), admin.email]
        );
      }
    }

    res.status(200).json({
      message: 'Your message has been sent successfully. We will get back to you soon!'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { submitContactForm };
