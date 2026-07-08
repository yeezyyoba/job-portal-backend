// controllers/interviewController.js
const { get, run, query } = require('../config/db');
const sendEmail = require('../utils/sendEmail');

// Helper to push notification to a user's notifications array
const pushNotification = async (userEmail, notif) => {
  const user = await get('SELECT notifications FROM users WHERE email = ?', [userEmail]);
  if (user) {
    let notifications = [];
    try {
      notifications = JSON.parse(user.notifications || '[]');
    } catch (e) {}
    notifications.unshift(notif);
    await run('UPDATE users SET notifications = ? WHERE email = ?', [JSON.stringify(notifications), userEmail]);
  }
};

// @desc    Get all interviews for seeker or employer
// @route   GET /api/interviews
// @access  Private (Seeker/Employer)
const getInterviews = async (req, res, next) => {
  try {
    const { email, role } = req.user;
    const activeRole = req.query.role || (role === 'both' ? 'seeker' : role);
    let rows;

    if (activeRole === 'seeker') {
      rows = await query(
        `SELECT i.*, j.title, j.company, j.companyLogo 
         FROM interviews i 
         JOIN jobs j ON i.jobId = j.id 
         WHERE i.seekerEmail = ? 
         ORDER BY i.dateTime ASC`,
        [email]
      );
    } else if (activeRole === 'employer') {
      rows = await query(
        `SELECT i.*, j.title, u.name as candidateName, u.profilePhoto as candidatePhoto 
         FROM interviews i 
         JOIN jobs j ON i.jobId = j.id 
         JOIN users u ON i.seekerEmail = u.email 
         WHERE i.employerEmail = ? 
         ORDER BY i.dateTime ASC`,
        [email]
      );
    } else {
      res.statusCode = 400;
      throw new Error('Access denied, invalid user role');
    }

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

// @desc    Schedule a new interview
// @route   POST /api/interviews
// @access  Private (Employer)
const scheduleInterview = async (req, res, next) => {
  try {
    const { applicationId, dateTime, format, link, location, notes } = req.body;

    if (!applicationId || !dateTime || !format) {
      res.statusCode = 400;
      throw new Error('Please include applicationId, dateTime, and meeting format');
    }

    const nowTime = new Date();
    const inputTime = new Date(dateTime);
    // Allow up to 24 hours of difference to account for timezone offsets between client and server
    const differenceInMs = nowTime.getTime() - inputTime.getTime();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    if (differenceInMs > twentyFourHoursInMs) {
      res.statusCode = 400;
      throw new Error('The interview date and time cannot be set in the past');
    }

    // Get application and job
    const app = await get('SELECT * FROM applications WHERE id = ?', [applicationId]);
    if (!app) {
      res.statusCode = 404;
      throw new Error('Job application entry not found');
    }

    const job = await get('SELECT title, company FROM jobs WHERE id = ?', [app.jobId]);
    const seeker = await get('SELECT name FROM users WHERE email = ?', [app.seekerEmail]);
    const seekerName = seeker ? seeker.name : 'Applicant';

    // Check ownership
    if (job.company.toLowerCase() !== req.user.companyName.toLowerCase()) {
      res.statusCode = 403;
      throw new Error('Access denied, you do not own the job listing associated with this application');
    }

    const id = 'int-' + Date.now();

    await run(
      `INSERT INTO interviews (id, applicationId, jobId, employerEmail, seekerEmail, dateTime, format, link, location, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, applicationId, app.jobId, req.user.email, app.seekerEmail, dateTime, format, link || '', location || '', notes || '']
    );

    // Update Application Status
    await run("UPDATE applications SET status = 'Interview Scheduled' WHERE id = ?", [applicationId]);

    // Send notifications to Seeker
    let interviewMessage = `An interview has been scheduled for "${job.title}" on ${dateTime.replace('T', ' at ')}. Format: ${format}.`;
    if (link) {
      interviewMessage += ` Meeting Link: ${link}`;
    }
    if (location) {
      interviewMessage += ` Location: ${location}`;
    }
    if (notes) {
      interviewMessage += ` Notes: ${notes}`;
    }

    await pushNotification(app.seekerEmail, {
      id: "notif-int-" + Date.now(),
      title: "Interview Scheduled!",
      message: interviewMessage,
      link: link || null,
      date: new Date().toISOString().split('T')[0],
      read: false
    });

    // Send Email to Seeker
    const emailSubject = `Interview Scheduled: ${job.title} at ${job.company}`;
    const formattedDateTime = dateTime.replace('T', ' at ');
    const emailText = `Hello ${seekerName},\n\nYou have been selected for an interview for the position of "${job.title}" at ${job.company}.\n\nHere are the interview details:\n- Date & Time: ${formattedDateTime}\n- Format: ${format}${link ? `\n- Meeting Link: ${link}` : ''}${location ? `\n- Location: ${location}` : ''}${notes ? `\n- Notes: ${notes}` : ''}\n\nBest regards,\nJobPortal Support Team`;
    
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #4F46E5; margin-top: 0;">Interview Scheduled!</h2>
        <p>Hello <strong>${seekerName}</strong>,</p>
        <p>Congratulations! You have been selected for an interview for the <strong>${job.title}</strong> position at <strong>${job.company}</strong>.</p>
        <div style="background-color: #f9fafb; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <h4 style="margin: 0 0 10px 0; color: #111827;">Interview details:</h4>
          <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${formattedDateTime}</p>
          <p style="margin: 5px 0;"><strong>Format:</strong> ${format}</p>
          ${link ? `<p style="margin: 5px 0;"><strong>Meeting Link:</strong> <a href="${link}" target="_blank" style="color: #4F46E5; text-decoration: none;">Join Interview</a></p>` : ''}
          ${location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${location}</p>` : ''}
          ${notes ? `<p style="margin: 10px 0 0 0; font-size: 14px; color: #4b5563; font-style: italic;"><strong>Additional Notes:</strong> ${notes}</p>` : ''}
        </div>
        <p>Please make sure to join the meeting on time. If you have any questions, you can contact the employer directly or reply to this email.</p>
        <p style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 12px; color: #9ca3af;">
          Best regards,<br>
          <strong>JobPortal Support Team</strong>
        </p>
      </div>
    `;

    try {
      await sendEmail({
        to: app.seekerEmail,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      });
    } catch (emailErr) {
      console.error('Failed to send interview scheduling email:', emailErr);
    }

    const created = await get('SELECT * FROM interviews WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel a scheduled interview
// @route   DELETE /api/interviews/:id
// @access  Private (Employer)
const cancelInterview = async (req, res, next) => {
  try {
    const interview = await get('SELECT * FROM interviews WHERE id = ?', [req.params.id]);
    if (!interview) {
      res.statusCode = 404;
      throw new Error('Interview schedule entry not found');
    }

    if (interview.employerEmail !== req.user.email) {
      res.statusCode = 403;
      throw new Error('Access denied, you cannot cancel someone else\'s interview');
    }

    const job = await get('SELECT title FROM jobs WHERE id = ?', [interview.jobId]);

    // Send notification to seeker
    await pushNotification(interview.seekerEmail, {
      id: "notif-int-c-" + Date.now(),
      title: "Interview Cancelled",
      message: `Your interview for "${job ? job.title : 'Job Post'}" scheduled on ${interview.dateTime.replace('T', ' at ')} has been cancelled.`,
      date: new Date().toISOString().split('T')[0],
      read: false
    });

    await run('DELETE FROM interviews WHERE id = ?', [req.params.id]);
    res.json({ message: 'Interview schedule successfully cancelled' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInterviews,
  scheduleInterview,
  cancelInterview
};
