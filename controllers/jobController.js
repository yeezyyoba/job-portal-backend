// controllers/jobController.js
const { get, run, query } = require('../config/db');

// Helper to parse job requirements/responsibilities strings into JSON
const parseJobJSON = (job) => {
  if (!job) return null;
  const parsed = { ...job };
  try { parsed.requirements = JSON.parse(parsed.requirements || '[]'); } catch(e) {}
  try { parsed.responsibilities = JSON.parse(parsed.responsibilities || '[]'); } catch(e) {}
  parsed.approved = parsed.approved === 1;
  parsed.featured = parsed.featured === 1;
  return parsed;
};

// @desc    Get all active approved jobs
// @route   GET /api/jobs
// @access  Public
const getJobs = async (req, res, next) => {
  try {
    const { category, location, remoteType, keyword } = req.query;
    let sql = "SELECT * FROM jobs WHERE status = 'active' AND approved = 1";
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (remoteType) {
      sql += ' AND remoteType = ?';
      params.push(remoteType);
    }
    if (location) {
      sql += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }
    if (keyword) {
      sql += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
      const term = `%${keyword}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY datePosted DESC';

    const rows = await query(sql, params);
    res.json(rows.map(parseJobJSON));
  } catch (error) {
    next(error);
  }
};

// @desc    Get single job details
// @route   GET /api/jobs/:id
// @access  Public
const getJob = async (req, res, next) => {
  try {
    const job = await get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) {
      res.statusCode = 404;
      throw new Error('Job listing not found');
    }
    res.json(parseJobJSON(job));
  } catch (error) {
    next(error);
  }
};

// @desc    Create a job listing
// @route   POST /api/jobs
// @access  Private (Employer)
const createJob = async (req, res, next) => {
  try {
    const { title, category, description, requirements, responsibilities, salaryRange, location, employmentType, experienceRequired, deadline, remoteType } = req.body;

    if (!title || !category || !description || !salaryRange || !location || !deadline) {
      res.statusCode = 400;
      throw new Error('Please include all required job information fields');
    }

    const today = new Date().toISOString().split('T')[0];
    if (deadline < today) {
      res.statusCode = 400;
      throw new Error('Application deadline cannot be in the past');
    }

    // Get employer profile details
    const employer = await get('SELECT companyName, logo FROM users WHERE email = ?', [req.user.email]);
    const company = employer ? employer.companyName : 'Unknown Company';
    const companyLogo = employer ? employer.logo : '';

    // Get auto-approval configuration settings
    const settingsRow = await get('SELECT configurations FROM settings LIMIT 1');
    let autoApprove = 0;
    if (settingsRow) {
      try {
        const config = JSON.parse(settingsRow.configurations);
        autoApprove = config.autoApproveJobs ? 1 : 0;
      } catch(e) {}
    }

    const id = 'job-' + Date.now();
    const datePosted = new Date().toISOString().split('T')[0];
    const requirementsStr = JSON.stringify(Array.isArray(requirements) ? requirements : (requirements || '').split('\n').map(r => r.trim()).filter(r => r !== ''));
    const responsibilitiesStr = JSON.stringify(Array.isArray(responsibilities) ? responsibilities : (responsibilities || '').split('\n').map(r => r.trim()).filter(r => r !== ''));

    await run(`
      INSERT INTO jobs (id, title, company, companyLogo, category, description, requirements, responsibilities, salaryRange, location, employmentType, experienceRequired, deadline, remoteType, datePosted, status, approved, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0)`,
      [id, title, company, companyLogo, category, description, requirementsStr, responsibilitiesStr, salaryRange, location, employmentType, experienceRequired, deadline, remoteType, datePosted, autoApprove]
    );

    const createdJob = await get('SELECT * FROM jobs WHERE id = ?', [id]);
    res.status(201).json(parseJobJSON(createdJob));
  } catch (error) {
    next(error);
  }
};

// @desc    Update a job listing
// @route   PUT /api/jobs/:id
// @access  Private (Employer/Admin)
const updateJob = async (req, res, next) => {
  try {
    const job = await get('SELECT company, deadline FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) {
      res.statusCode = 404;
      throw new Error('Job listing not found');
    }

    // Check ownership (Employers can only edit their own jobs, Admin can edit anything)
    if (req.user.role === 'employer' && job.company.toLowerCase() !== req.user.companyName.toLowerCase()) {
      res.statusCode = 403;
      throw new Error('Access denied, you do not own this job listing');
    }

    const { title, category, description, requirements, responsibilities, salaryRange, location, employmentType, experienceRequired, deadline, remoteType, status } = req.body;
    
    if (deadline && deadline !== job.deadline) {
      const today = new Date().toISOString().split('T')[0];
      if (deadline < today) {
        res.statusCode = 400;
        throw new Error('Application deadline cannot be in the past');
      }
    }

    const requirementsStr = requirements ? JSON.stringify(Array.isArray(requirements) ? requirements : requirements.split('\n')) : undefined;
    const responsibilitiesStr = responsibilities ? JSON.stringify(Array.isArray(responsibilities) ? responsibilities : responsibilities.split('\n')) : undefined;

    await run(`
      UPDATE jobs SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        requirements = COALESCE(?, requirements),
        responsibilities = COALESCE(?, responsibilities),
        salaryRange = COALESCE(?, salaryRange),
        location = COALESCE(?, location),
        employmentType = COALESCE(?, employmentType),
        experienceRequired = COALESCE(?, experienceRequired),
        deadline = COALESCE(?, deadline),
        remoteType = COALESCE(?, remoteType),
        status = COALESCE(?, status)
      WHERE id = ?`,
      [title, category, description, requirementsStr, responsibilitiesStr, salaryRange, location, employmentType, experienceRequired, deadline, remoteType, status, req.params.id]
    );

    const updated = await get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    res.json(parseJobJSON(updated));
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a job listing
// @route   DELETE /api/jobs/:id
// @access  Private (Employer/Admin)
const deleteJob = async (req, res, next) => {
  try {
    const job = await get('SELECT company FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) {
      res.statusCode = 404;
      throw new Error('Job listing not found');
    }

    // Check ownership
    if (req.user.role === 'employer' && job.company.toLowerCase() !== req.user.companyName.toLowerCase()) {
      res.statusCode = 403;
      throw new Error('Access denied, you do not own this job listing');
    }

    await run('DELETE FROM jobs WHERE id = ?', [req.params.id]);
    // Purge associated applications
    await run('DELETE FROM applications WHERE jobId = ?', [req.params.id]);
    
    res.json({ message: 'Job listing and related applications removed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  parseJobJSON
};
