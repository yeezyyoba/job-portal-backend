// controllers/adminController.js
const { get, run, query } = require('../config/db');
const { parseUserJSON } = require('./authController');
const { parseJobJSON } = require('./jobController');

// @desc    Get all users list
// @route   GET /api/admin/users
// @access  Private (Admin)
const getUsers = async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM users ORDER BY email ASC');
    res.json(rows.map(parseUserJSON));
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle user suspension status (Active/Suspended)
// @route   PUT /api/admin/users/:email/status
// @access  Private (Admin)
const toggleUserSuspension = async (req, res, next) => {
  try {
    const { email } = req.params;
    const user = await get('SELECT status, role FROM users WHERE email = ?', [email]);
    
    if (!user) {
      res.statusCode = 404;
      throw new Error('User account not found');
    }

    if (user.role === 'superadmin') {
      res.statusCode = 400;
      throw new Error('Super Admin accounts cannot be suspended');
    }

    if (user.role === 'admin' && req.user.role !== 'superadmin') {
      res.statusCode = 403;
      throw new Error('Forbidden: Only Super Admins can suspend administrative accounts');
    }

    const nextStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
    await run('UPDATE users SET status = ? WHERE email = ?', [nextStatus, email]);
    
    res.json({ message: `User status set to ${nextStatus}` });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete user account
// @route   DELETE /api/admin/users/:email
// @access  Private (Admin)
const deleteUser = async (req, res, next) => {
  try {
    const { email } = req.params;
    const user = await get('SELECT role FROM users WHERE email = ?', [email]);

    if (!user) {
      res.statusCode = 404;
      throw new Error('User account not found');
    }

    if (user.role === 'superadmin') {
      res.statusCode = 400;
      throw new Error('Super Admin accounts cannot be deleted');
    }

    if (user.role === 'admin' && req.user.role !== 'superadmin') {
      res.statusCode = 403;
      throw new Error('Forbidden: Only Super Admins can delete administrative accounts');
    }

    await run('DELETE FROM users WHERE email = ?', [email]);
    res.json({ message: 'User account successfully deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle verified status for employers
// @route   PUT /api/admin/verification/:email
// @access  Private (Admin)
const verifyEmployer = async (req, res, next) => {
  try {
    const { email } = req.params;
    const { verified } = req.body; // true or false boolean

    const user = await get('SELECT role FROM users WHERE email = ?', [email]);

    if (!user || user.role !== 'employer') {
      res.statusCode = 404;
      throw new Error('Employer account not found');
    }

    const val = verified ? 1 : 0;
    await run('UPDATE users SET verified = ? WHERE email = ?', [val, email]);

    // Push notification to Employer profile
    const appliedNotif = {
      id: "notif-v-" + Date.now(),
      title: verified ? "Employer Verification Approved" : "Verification Status Revoked",
      message: verified 
        ? "Your employer profile has been verified. Job postings will now appear as verified."
        : "Your employer profile verification status has been set to pending.",
      date: new Date().toISOString().split('T')[0],
      read: false
    };

    let notifications = [];
    const empRow = await get('SELECT notifications FROM users WHERE email = ?', [email]);
    if (empRow) {
      try { notifications = JSON.parse(empRow.notifications || '[]'); } catch(e) {}
    }
    notifications.unshift(appliedNotif);
    await run('UPDATE users SET notifications = ? WHERE email = ?', [JSON.stringify(notifications), email]);

    res.json({ message: `Employer verification status updated successfully` });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all jobs (approved & unapproved) for moderation
// @route   GET /api/admin/jobs
// @access  Private (Admin)
const getModerationJobs = async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM jobs ORDER BY datePosted DESC');
    res.json(rows.map(parseJobJSON));
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle job approval status
// @route   PUT /api/admin/jobs/:id/approve
// @access  Private (Admin)
const approveJob = async (req, res, next) => {
  try {
    const { approved } = req.body; // true or false

    const job = await get('SELECT id FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) {
      res.statusCode = 404;
      throw new Error('Job listing not found');
    }

    const val = approved ? 1 : 0;
    await run('UPDATE jobs SET approved = ? WHERE id = ?', [val, req.params.id]);
    
    res.json({ message: `Job approval status set to ${approved}` });
  } catch (error) {
    next(error);
  }
};

// @desc    Get global settings configuration
// @route   GET /api/admin/settings
// @access  Public
const getSettings = async (req, res, next) => {
  try {
    const row = await get('SELECT * FROM settings LIMIT 1');
    if (!row) {
      res.statusCode = 404;
      throw new Error('Settings configurations not found');
    }

    const parsed = {
      siteName: row.siteName,
      emailSettings: JSON.parse(row.emailSettings || '{}'),
      notificationSettings: JSON.parse(row.notificationSettings || '{}'),
      configurations: JSON.parse(row.configurations || '{}')
    };

    res.json(parsed);
  } catch (error) {
    next(error);
  }
};

// @desc    Update global settings configuration
// @route   PUT /api/admin/settings
// @access  Private (Admin)
const updateSettings = async (req, res, next) => {
  try {
    const { siteName, emailSettings, notificationSettings, configurations } = req.body;

    const row = await get('SELECT id FROM settings LIMIT 1');
    if (!row) {
      res.statusCode = 404;
      throw new Error('Settings configurations not found');
    }

    const emailSettingsStr = emailSettings ? JSON.stringify(emailSettings) : undefined;
    const notificationSettingsStr = notificationSettings ? JSON.stringify(notificationSettings) : undefined;
    const configurationsStr = configurations ? JSON.stringify(configurations) : undefined;

    await run(`
      UPDATE settings SET
        siteName = COALESCE(?, siteName),
        emailSettings = COALESCE(?, emailSettings),
        notificationSettings = COALESCE(?, notificationSettings),
        configurations = COALESCE(?, configurations)
      WHERE id = ?`,
      [siteName, emailSettingsStr, notificationSettingsStr, configurationsStr, row.id]
    );

    res.json({ message: 'Settings successfully updated' });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new admin account
// @route   POST /api/admin/users/admin
// @access  Private (Super Admin)
const createAdmin = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.statusCode = 400;
      throw new Error('Please include email, password and name');
    }

    // Check if user exists
    const userExists = await get('SELECT email FROM users WHERE email = ?', [email]);
    if (userExists) {
      res.statusCode = 400;
      throw new Error('User already exists with this email address');
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync(password, 10);

    await run(
      `INSERT INTO users (email, role, password, name, status, verified) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, 'admin', hashedPassword, name, 'Active', 1]
    );

    res.status(201).json({
      message: 'Admin account created successfully',
      email,
      name
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  toggleUserSuspension,
  deleteUser,
  verifyEmployer,
  getModerationJobs,
  approveJob,
  getSettings,
  updateSettings,
  createAdmin
};
