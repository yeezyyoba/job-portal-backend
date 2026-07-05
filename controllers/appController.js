// controllers/appController.js
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

// @desc    Get all applications (Seekers see theirs, Employers see candidate submissions)
// @route   GET /api/applications
// @access  Private (Seeker/Employer)
const getApplications = async (req, res, next) => {
  try {
    const { email, role, companyName } = req.user;
    const activeRole = req.query.role || (role === 'both' ? 'seeker' : role);
    let rows;

    if (activeRole === 'seeker') {
      rows = await query(
        `SELECT a.*, j.title, j.company, j.companyLogo, j.location, j.remoteType 
         FROM applications a 
         JOIN jobs j ON a.jobId = j.id 
         WHERE a.seekerEmail = ? 
         ORDER BY a.appliedDate DESC`,
        [email]
      );
    } else if (activeRole === 'employer') {
      rows = await query(
        `SELECT a.*, j.title, j.company, 
                u.name as candidateName, u.profilePhoto as candidatePhoto,
                u.phone as candidatePhone, u.address as candidateAddress,
                u.skills as candidateSkills, u.education as candidateEducation,
                u.certifications as candidateCertifications, u.experience as candidateExperience,
                u.languages as candidateLanguages
         FROM applications a 
         JOIN jobs j ON a.jobId = j.id 
         JOIN users u ON a.seekerEmail = u.email 
         WHERE LOWER(j.company) = LOWER(?) 
         ORDER BY a.appliedDate DESC`,
        [companyName]
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

// @desc    Submit a job application
// @route   POST /api/applications
// @access  Private (Seeker)
const createApplication = async (req, res, next) => {
  try {
    const { jobId, coverLetter } = req.body;

    if (!jobId || !coverLetter) {
      res.statusCode = 400;
      throw new Error('Please include jobId and coverLetter');
    }

    // Check if job exists
    const job = await get('SELECT title, company, status, approved FROM jobs WHERE id = ?', [jobId]);
    if (!job || job.status !== 'active' || job.approved !== 1) {
      res.statusCode = 404;
      throw new Error('Job listing not found or is no longer active');
    }

    // Check if already applied
    const alreadyApplied = await get('SELECT id FROM applications WHERE jobId = ? AND seekerEmail = ?', [jobId, req.user.email]);
    if (alreadyApplied) {
      res.statusCode = 400;
      throw new Error('You have already submitted an application for this job opening');
    }

    // Get seeker resume name
    const seekerProfile = await get('SELECT resumeName, name FROM users WHERE email = ?', [req.user.email]);
    const resumeName = seekerProfile ? (seekerProfile.resumeName || 'default_resume.pdf') : 'default_resume.pdf';

    const id = 'app-' + Date.now();
    const appliedDate = new Date().toISOString().split('T')[0];

    await run(
      `INSERT INTO applications (id, jobId, seekerEmail, status, resumeName, coverLetter, appliedDate) 
       VALUES (?, ?, ?, 'Applied', ?, ?, ?)`,
      [id, jobId, req.user.email, resumeName, coverLetter, appliedDate]
    );

    // Notify Employer (find employer matching job company)
    const employer = await get("SELECT email FROM users WHERE role = 'employer' AND LOWER(companyName) = LOWER(?)", [job.company]);
    if (employer) {
      await pushNotification(employer.email, {
        id: "notif-e-" + Date.now(),
        title: "New Application Received",
        message: `${seekerProfile.name || req.user.email} applied for "${job.title}".`,
        date: appliedDate,
        read: false
      });
    }

    const created = await get('SELECT * FROM applications WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

// @desc    Update applicant status (Shortlist, Accept, Reject)
// @route   PUT /api/applications/:id/status
// @access  Private (Employer)
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      res.statusCode = 400;
      throw new Error('Please include target candidate status');
    }

    const appObj = await get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
    if (!appObj) {
      res.statusCode = 404;
      throw new Error('Job application entry not found');
    }

    const job = await get('SELECT title, company FROM jobs WHERE id = ?', [appObj.jobId]);

    // Check ownership
    if (job.company.toLowerCase() !== req.user.companyName.toLowerCase()) {
      res.statusCode = 403;
      throw new Error('Access denied, you do not own the job listing associated with this application');
    }

    await run('UPDATE applications SET status = ? WHERE id = ?', [status, req.params.id]);

    // Notify Candidate
    await pushNotification(appObj.seekerEmail, {
      id: "notif-s-" + Date.now(),
      title: `Application Update: ${job.title}`,
      message: `Your application status has been updated to "${status}".`,
      date: new Date().toISOString().split('T')[0],
      read: false
    });

    res.json({ message: `Applicant status successfully set to ${status}` });
  } catch (error) {
    next(error);
  }
};

// @desc    Withdraw application
// @route   DELETE /api/applications/:id
// @access  Private (Seeker)
const withdrawApplication = async (req, res, next) => {
  try {
    const appObj = await get('SELECT seekerEmail FROM applications WHERE id = ?', [req.params.id]);
    if (!appObj) {
      res.statusCode = 404;
      throw new Error('Job application entry not found');
    }

    if (appObj.seekerEmail !== req.user.email) {
      res.statusCode = 403;
      throw new Error('Access denied, you cannot withdraw someone else\'s application');
    }

    await run('DELETE FROM applications WHERE id = ?', [req.params.id]);
    res.json({ message: 'Application successfully withdrawn' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getApplications,
  createApplication,
  updateApplicationStatus,
  withdrawApplication
};
