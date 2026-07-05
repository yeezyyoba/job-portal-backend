// controllers/interviewController.js
const { get, run, query } = require('../config/db');

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
    await pushNotification(app.seekerEmail, {
      id: "notif-int-" + Date.now(),
      title: "Interview Scheduled!",
      message: `An interview has been scheduled for "${job.title}" on ${dateTime.replace('T', ' at ')}. Format: ${format}.`,
      date: new Date().toISOString().split('T')[0],
      read: false
    });

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
