// config/db.js
const { Client, Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pgConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'password',
};

const pool = new Pool({
  ...pgConfig,
  database: process.env.PGDATABASE || 'job_portal'
});

// Translation layer from SQLite '?' placeholders to PostgreSQL '$1, $2, ...'
const translatePlaceholders = (sql) => {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
};

// Map lowercase returned column keys to React client camelCase expectations
const keyMap = {
  companyname: 'companyName',
  companylogo: 'companyLogo',
  employmenttype: 'employmentType',
  experiencerequired: 'experienceRequired',
  dateposted: 'datePosted',
  remotetype: 'remoteType',
  seekeremail: 'seekerEmail',
  applieddate: 'appliedDate',
  resumename: 'resumeName',
  coverletter: 'coverLetter',
  applicationid: 'applicationId',
  employeremail: 'employerEmail',
  datetime: 'dateTime',
  reporteremail: 'reporterEmail',
  sitename: 'siteName',
  emailsettings: 'emailSettings',
  notificationsettings: 'notificationSettings',
  socialmedia: 'socialMedia',
  savedjobs: 'savedJobs',
  profilephoto: 'profilePhoto',
  jobid: 'jobId',
  emailverified: 'emailVerified',
  verificationcode: 'verificationCode',
  verificationcodeexpires: 'verificationCodeExpires',
  candidatename: 'candidateName',
  candidatephoto: 'candidatePhoto',
  candidatephone: 'candidatePhone',
  candidateaddress: 'candidateAddress',
  candidateskills: 'candidateSkills',
  candidateeducation: 'candidateEducation',
  candidatecertifications: 'candidateCertifications',
  candidateexperience: 'candidateExperience',
  candidatelanguages: 'candidateLanguages',
  resetpasswordcode: 'resetPasswordCode',
  resetpasswordexpires: 'resetPasswordExpires',
  passwordhistory: 'passwordHistory'
};

const mapRowKeys = (row) => {
  if (!row) return null;
  const mapped = {};
  for (const key of Object.keys(row)) {
    const targetKey = keyMap[key.toLowerCase()] || key;
    mapped[targetKey] = row[key];
  }
  return mapped;
};

// DB Queries Wrappers
const query = async (sql, params = []) => {
  const pgSql = translatePlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return res.rows.map(mapRowKeys);
};

const run = async (sql, params = []) => {
  const pgSql = translatePlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return { id: null, changes: res.rowCount };
};

const get = async (sql, params = []) => {
  const pgSql = translatePlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return res.rows.length > 0 ? mapRowKeys(res.rows[0]) : null;
};

// Auto-creates the database if it is not present
const checkAndCreateDatabase = async () => {
  const targetDb = process.env.PGDATABASE || 'job_portal';
  const client = new Client({
    ...pgConfig,
    database: 'postgres' // Connect to default postgres DB first
  });

  try {
    await client.connect();
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    
    if (res.rowCount === 0) {
      console.log(`Database '${targetDb}' does not exist. Creating database...`);
      // CREATE DATABASE cannot run inside transaction, run on simple client query
      await client.query(`CREATE DATABASE ${targetDb}`);
      console.log(`Database '${targetDb}' created successfully.`);
    } else {
      console.log(`Database '${targetDb}' verified.`);
    }
  } catch (err) {
    console.error('Error verifying/creating PostgreSQL database:', err.message);
  } finally {
    await client.end();
  }
};

// Database Schema Migrations and Seeding
const initDb = async () => {
  try {
    // Make sure database is verified first
    await checkAndCreateDatabase();

    // 1. Users Table
    await run(`CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      address TEXT,
      dob TEXT,
      gender TEXT,
      skills TEXT,
      education TEXT,
      certifications TEXT,
      experience TEXT,
      languages TEXT,
      resumeName TEXT,
      profilePhoto TEXT,
      savedJobs TEXT,
      notifications TEXT,
      companyName TEXT,
      logo TEXT,
      industry TEXT,
      website TEXT,
      description TEXT,
      socialMedia TEXT,
      verified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Active',
      emailVerified INTEGER DEFAULT 0,
      verificationCode TEXT,
      verificationCodeExpires TEXT,
      resetPasswordCode TEXT,
      resetPasswordExpires TEXT,
      passwordHistory TEXT DEFAULT '[]'
    )`);

    // Dynamic schema migrations for existing databases
    try {
      await run(`ALTER TABLE users ADD COLUMN resetPasswordCode TEXT`);
    } catch (e) {
      // Ignore if column already exists
    }
    try {
      await run(`ALTER TABLE users ADD COLUMN resetPasswordExpires TEXT`);
    } catch (e) {
      // Ignore if column already exists
    }
    try {
      await run(`ALTER TABLE users ADD COLUMN passwordHistory TEXT DEFAULT '[]'`);
    } catch (e) {
      // Ignore if column already exists
    }

    // 2. Jobs Table
    await run(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      companyLogo TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      requirements TEXT NOT NULL,
      responsibilities TEXT NOT NULL,
      salaryRange TEXT NOT NULL,
      location TEXT NOT NULL,
      employmentType TEXT NOT NULL,
      experienceRequired TEXT NOT NULL,
      deadline TEXT NOT NULL,
      remoteType TEXT NOT NULL,
      datePosted TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      approved INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0
    )`);

    // 3. Applications Table
    await run(`CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      seekerEmail TEXT NOT NULL,
      status TEXT DEFAULT 'Applied',
      resumeName TEXT NOT NULL,
      coverLetter TEXT NOT NULL,
      appliedDate TEXT NOT NULL,
      FOREIGN KEY(jobId) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(seekerEmail) REFERENCES users(email) ON DELETE CASCADE
    )`);

    // 4. Interviews Table
    await run(`CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      applicationId TEXT NOT NULL,
      jobId TEXT NOT NULL,
      employerEmail TEXT NOT NULL,
      seekerEmail TEXT NOT NULL,
      dateTime TEXT NOT NULL,
      format TEXT NOT NULL,
      link TEXT,
      location TEXT,
      notes TEXT,
      FOREIGN KEY(applicationId) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY(jobId) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(seekerEmail) REFERENCES users(email) ON DELETE CASCADE
    )`);

    // 5. Reports Table
    await run(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      reporterEmail TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      date TEXT NOT NULL,
      FOREIGN KEY(jobId) REFERENCES jobs(id) ON DELETE CASCADE
    )`);

    // 6. Settings Table
    await run(`CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      siteName TEXT DEFAULT 'IE-JobPortal',
      emailSettings TEXT,
      notificationSettings TEXT,
      configurations TEXT
    )`);

    // --- Schema Migrations ---
    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerified INTEGER DEFAULT 0`);
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verificationCode TEXT`);
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verificationCodeExpires TEXT`);
    } catch (err) {
      console.log('Migration error or columns already exist (ignoring):', err.message);
    }

    // --- Seed Initial Data ---
    
    // Seed settings if empty
    const settingsCount = await get('SELECT COUNT(*) as count FROM settings');
    if (parseInt(settingsCount.count) === 0) {
      const emailSettings = JSON.stringify({
        fromAddress: "no-reply@jobportal.com",
        smtpServer: "smtp.jobportal.com",
        port: "587"
      });
      const notificationSettings = JSON.stringify({
        emailAlerts: true,
        instantInvites: true,
        weeklySummary: false
      });
      const configurations = JSON.stringify({
        autoApproveJobs: false,
        maxFileSizeMB: "5",
        allowedUploadTypes: ".pdf, .doc, .docx"
      });
      await run(`INSERT INTO settings (siteName, emailSettings, notificationSettings, configurations) VALUES (?, ?, ?, ?)`,
        ['IE-JobPortal', emailSettings, notificationSettings, configurations]
      );
    } else {
      // Auto-migrate existing name from JobPortal to IE-JobPortal
      await run(`UPDATE settings SET siteName = 'IE-JobPortal' WHERE siteName = 'JobPortal'`);
    }

    // Seed Super Admin if missing, or update password if changed in env
    const superadminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@portal.com';
    const superadminExists = await get('SELECT email, password FROM users WHERE email = ?', [superadminEmail]);
    const superadminPasswordRaw = process.env.SUPERADMIN_PASSWORD || 'password';

    if (!superadminExists) {
      const superadminPassword = bcrypt.hashSync(superadminPasswordRaw, 10);
      await run(`INSERT INTO users (email, role, password, name) VALUES (?, ?, ?, ?)`,
        [superadminEmail, 'superadmin', superadminPassword, 'System Super Admin']
      );
      console.log(`Database seeded with Super Admin: ${superadminEmail}`);
    } else {
      const isMatch = bcrypt.compareSync(superadminPasswordRaw, superadminExists.password);
      if (!isMatch) {
        const superadminPassword = bcrypt.hashSync(superadminPasswordRaw, 10);
        await run('UPDATE users SET password = ? WHERE email = ?', [superadminPassword, superadminEmail]);
        console.log(`Updated Super Admin password in database to match environment variable`);
      }
    }

    // Seed default users if empty
    const usersCount = await get('SELECT COUNT(*) as count FROM users');
    if (parseInt(usersCount.count) === 0) {
      const hashedPassword = bcrypt.hashSync('password', 10);
      
      // Admin
      await run(`INSERT INTO users (email, role, password, name) VALUES (?, ?, ?, ?)`,
        ['admin@portal.com', 'admin', hashedPassword, 'Jane Smith (Admin)']
      );

      // Job Seeker
      const skills = JSON.stringify(["JavaScript", "React", "CSS Grid", "HTML5", "Figma", "Node.js"]);
      const education = JSON.stringify([{ degree: "B.S. in Computer Science", school: "University of Washington", year: "2019" }]);
      const certifications = JSON.stringify(["AWS Certified Developer Associate", "UX Design Specialist Certificate"]);
      const experience = JSON.stringify([{ role: "Frontend Engineer", company: "Webflow Studio", duration: "2020 - 2023", description: "Developed marketing assets, customer onboarding templates, and responsive dashboard applications using custom JavaScript and modern CSS." }]);
      const languages = JSON.stringify(["English (Native)", "Spanish (Conversational)"]);
      const savedJobs = JSON.stringify(["job-2"]);
      const notifications = JSON.stringify([
        { id: "notif-s1", title: "Welcome to JobPortal!", message: "Fill in your profile details to unlock recommended jobs matching your skills.", date: "2026-06-25", read: false },
        { id: "notif-s2", title: "Profile Completed", message: "Your professional resume has been successfully parsed.", date: "2026-06-25", read: true }
      ]);
      await run(`INSERT INTO users (email, role, password, name, phone, address, dob, gender, skills, education, certifications, experience, languages, resumeName, profilePhoto, savedJobs, notifications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['seeker@portal.com', 'seeker', hashedPassword, 'Alex Johnson', '+1 (555) 019-2834', '123 Maple St, Seattle, WA 98101', '1997-05-14', 'Non-binary', skills, education, certifications, experience, languages, 'alex_johnson_resume.pdf', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&q=80', savedJobs, notifications]
      );

      // Employer (Verified)
      const socialMediaRide = JSON.stringify({ twitter: "@ride", linkedin: "linkedin.com/company/ride", github: "github.com/ride" });
      const empNotifs = JSON.stringify([{ id: "notif-e1", title: "Employer Account Approved", message: "Welcome to JobPortal. You can now post jobs, track analytics, and manage applicant pools.", date: "2026-06-25", read: false }]);
      await run(`INSERT INTO users (email, role, password, companyName, logo, industry, website, description, socialMedia, verified, notifications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['employer@portal.com', 'employer', hashedPassword, 'Ride', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyoMALyQxH2iPG0W0481QQofbME-c4q6dq3R15azq1Gg&s=10', 'HR / Transportation', 'https://ride.et', 'Ride is the leading transport and logistics booking platform in Ethiopia. We empower travelers and businesses with seamless ride-hailing solutions across Addis Ababa and beyond.', socialMediaRide, 1, empNotifs]
      );

      // Employer (Pending)
      const socialMediaSupa = JSON.stringify({ twitter: "@supabase", linkedin: "linkedin.com/company/supabase" });
      await run(`INSERT INTO users (email, role, password, companyName, logo, industry, website, description, socialMedia, verified, notifications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['pending_employer@portal.com', 'employer', hashedPassword, 'Supabase Inc.', 'https://images.unsplash.com/photo-1618005198143-e5283b519a7f?w=100&h=100&fit=crop&q=80', 'Backend-as-a-Service', 'https://supabase.com', 'Supabase is an open source Firebase alternative. We are building the features of Firebase using enterprise-grade open source tools.', socialMediaSupa, 0, '[]']
      );
    }

    // Ensure all seeded users are emailVerified = 1
    await run(`UPDATE users SET emailVerified = 1 WHERE email IN ('admin@portal.com', 'seeker@portal.com', 'employer@portal.com', 'pending_employer@portal.com', 'superadmin@portal.com')`);

    // Seed default jobs if empty
    const jobsCount = await get('SELECT COUNT(*) as count FROM jobs');
    if (parseInt(jobsCount.count) === 0) {
      const defaultJobs = [
        {
          id: "job-1",
          title: "Senior Front-End Architect",
          company: "Ride",
          companyLogo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyoMALyQxH2iPG0W0481QQofbME-c4q6dq3R15azq1Gg&s=10",
          category: "Development",
          description: "We are looking for a Senior Front-End Architect to design and implement the next generation of our merchant dashboards. You will collaborate closely with product design, core infrastructure, and product teams to build highly responsive, accessible, and elegant user interfaces.",
          requirements: JSON.stringify([
            "8+ years of professional software engineering experience",
            "Expert knowledge of modern JavaScript (ES6+), React, and styling systems",
            "Strong understanding of browser performance and architectural patterns",
            "Experience building scalable design systems"
          ]),
          responsibilities: JSON.stringify([
            "Lead technical direction of frontend platforms and tools",
            "Design reusable UI component architecture",
            "Mentor mid-level and senior engineers",
            "Improve rendering performance and accessibility standards (WCAG)"
          ]),
          salaryRange: "$150,000 - $190,000",
          location: "Addis Ababa",
          employmentType: "Full-time",
          experienceRequired: "Senior Level",
          deadline: "2026-08-15",
          remoteType: "Remote",
          datePosted: "2026-06-20",
          status: "active",
          approved: 1,
          featured: 1
        },
        {
          id: "job-2",
          title: "Product Designer (UI/UX)",
          company: "Temer Properties",
          companyLogo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzezkUFMdPsyMokbCKKOef512jY0RLWkmwjnn8OcxcB6bIJQ1uy092ROcw&s=10",
          category: "Design",
          description: "Join our core real estate team to craft unforgettable property finding and sales experiences. As a Product Designer, you will touch all aspects of user experience, from user research and wireframing to high-fidelity UI design and interaction animations.",
          requirements: JSON.stringify([
            "4+ years of UI/UX product design experience",
            "Strong portfolio demonstrating user-centered design solutions",
            "Proficiency in Figma, prototyping, and layout systems",
            "Ability to collaborate with frontend engineers for execution"
          ]),
          responsibilities: JSON.stringify([
            "Conduct user research and translate insights into prototypes",
            "Design polished user journeys and interactive interface mockups",
            "Collaborate with engineering to verify design implementation details",
            "Define and expand Temer Properties' visual guidelines"
          ]),
          salaryRange: "$120,000 - $150,000",
          location: "Hawassa",
          employmentType: "Full-time",
          experienceRequired: "Mid-Senior Level",
          deadline: "2026-07-30",
          remoteType: "Hybrid",
          datePosted: "2026-06-22",
          status: "active",
          approved: 1,
          featured: 1
        },
        {
          id: "job-3",
          title: "DevOps Engineer (Kubernetes & AWS)",
          company: "Kelemat",
          companyLogo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAA9vNp6apCMLK0UriTr03Ox-2Qoj4iT4y1Gf7KbTr6A&s",
          category: "DevOps",
          description: "Kelemat is seeking a Cloud Platform Infrastructure Engineer to manage deployment scalability. You will design, build, and run the global serverless edge infrastructure supporting millions of web applications.",
          requirements: JSON.stringify([
            "5+ years working with AWS, Terraform, and Kubernetes clusters",
            "Deep understanding of CI/CD pipelines, Docker, and shell scripting",
            "Experience operating high-traffic global websites",
            "Understanding of network layers, DNS, CDN routing, and SSL"
          ]),
          responsibilities: JSON.stringify([
            "Build and automate global edge deployment infrastructure",
            "Optimize cloud resource costs and monitoring coverage",
            "Manage incident response, logging dashboards, and system health alerts",
            "Standardize deployment pipelines across product teams"
          ]),
          salaryRange: "$140,000 - $175,000",
          location: "Remote",
          employmentType: "Full-time",
          experienceRequired: "Mid-Senior Level",
          deadline: "2026-07-28",
          remoteType: "Remote",
          datePosted: "2026-06-24",
          status: "active",
          approved: 1,
          featured: 0
        },
        {
          id: "job-4",
          title: "Head of Nursing",
          company: "Lancet General Hospital",
          companyLogo: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Lancet_General_Hospital_-_Logo.png",
          category: "Nursing",
          description: "Lancet General Hospital is seeking a Head of Nursing to lead, manage, and coordinate our nursing staff team. You will ensure high standards of patient care, develop nursing care plans, and supervise shift schedules.",
          requirements: JSON.stringify([
            "5+ years of nursing experience with active nursing license",
            "Superb leadership, communication, and organizing skills",
            "Experience in clinical management or hospital operations",
            "Ability to manage shifts and handle medical emergencies"
          ]),
          responsibilities: JSON.stringify([
            "Supervise and coordinate the nursing staff team",
            "Develop patient care plans and ensure compliance with medical standards",
            "Manage shift schedules and address staff concerns",
            "Provide guidance on nursing best practices"
          ]),
          salaryRange: "$100,000 - $135,000",
          location: "Addis Ababa",
          employmentType: "Full-time",
          experienceRequired: "Mid Level",
          deadline: "2026-08-05",
          remoteType: "On-site",
          datePosted: "2026-06-23",
          status: "active",
          approved: 1,
          featured: 0
        },
        {
          id: "job-5",
          title: "Junior Full-Stack Engineer",
          company: "Kelemat",
          companyLogo: "https://media.licdn.com/dms/image/sync/v2/D5627AQFE5X7dthP5JA/articleshare-shrink_800/B56ZtQutdqGsAQ-/0/1766585981571?e=2147483647&v=beta&t=BqFZybHYTbVS1gWHep2qHq355KfMDBGvZjViCk22OVI",
          category: "Development",
          description: "We are seeking a Junior Full-Stack Developer eager to learn and scale high-performance systems. You will assist in implementing client interfaces, updating database schemas, and testing software components.",
          requirements: JSON.stringify([
            "1-2 years of software development experience or bootcamp graduate",
            "Familiarity with HTML, CSS, JavaScript, and Node.js backend databases",
            "Understanding of Git workflows and basic SQL queries",
            "Eagerness to participate in code reviews and pair programming sessions"
          ]),
          responsibilities: JSON.stringify([
            "Develop web features under the guidance of lead developers",
            "Draft automated unit tests and resolve simple bug tickets",
            "Assist in maintaining technical product documentation",
            "Participate in agile daily standups and retro events"
          ]),
          salaryRange: "$70,000 - $95,000",
          location: "Bahir Dar",
          employmentType: "Full-time",
          experienceRequired: "Entry Level",
          deadline: "2026-08-10",
          remoteType: "Hybrid",
          datePosted: "2026-06-25",
          status: "active",
          approved: 0,
          featured: 0
        }
      ];

      for (const job of defaultJobs) {
        await run(`INSERT INTO jobs (id, title, company, companyLogo, category, description, requirements, responsibilities, salaryRange, location, employmentType, experienceRequired, deadline, remoteType, datePosted, status, approved, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [job.id, job.title, job.company, job.companyLogo, job.category, job.description, job.requirements, job.responsibilities, job.salaryRange, job.location, job.employmentType, job.experienceRequired, job.deadline, job.remoteType, job.datePosted, job.status, job.approved, job.featured]
        );
      }
    }

    // Migrate existing jobs to Ethiopian locations if they still use US cities
    await run("UPDATE jobs SET location = 'Addis Ababa' WHERE location = 'San Francisco, CA'");
    await run("UPDATE jobs SET location = 'Hawassa' WHERE location = 'New York, NY'");
    await run("UPDATE jobs SET location = 'Adama' WHERE location = 'Seattle, WA'");
    await run("UPDATE jobs SET location = 'Bahir Dar' WHERE location = 'Austin, TX'");

    // Migrate existing Stripe, Airbnb, Vercel, Linear records to the new companies
    await run("UPDATE users SET companyName = 'Ride', logo = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyoMALyQxH2iPG0W0481QQofbME-c4q6dq3R15azq1Gg&s=10', industry = 'HR / Transportation', website = 'https://ride.et', description = 'Ride is the leading transport and logistics booking platform in Ethiopia. We empower travelers and businesses with seamless ride-hailing solutions across Addis Ababa and beyond.' WHERE email = 'employer@portal.com' AND companyName = 'Stripe'");
    await run("UPDATE jobs SET company = 'Ride', companyLogo = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyoMALyQxH2iPG0W0481QQofbME-c4q6dq3R15azq1Gg&s=10' WHERE id = 'job-1' AND company = 'Stripe'");
    await run("UPDATE jobs SET company = 'Temer Properties', companyLogo = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzezkUFMdPsyMokbCKKOef512jY0RLWkmwjnn8OcxcB6bIJQ1uy092ROcw&s=10', description = 'Join our core real estate team to craft unforgettable property finding and sales experiences. As a Product Designer, you will touch all aspects of user experience, from user research and wireframing to high-fidelity UI design and interaction animations.' WHERE id = 'job-2' AND company = 'Airbnb'");
    await run("UPDATE jobs SET company = 'Kelemat', companyLogo = 'https://media.licdn.com/dms/image/sync/v2/D5627AQFE5X7dthP5JA/articleshare-shrink_800/B56ZtQutdqGsAQ-/0/1766585981571?e=2147483647&v=beta&t=BqFZybHYTbVS1gWHep2qHq355KfMDBGvZjViCk22OVI' WHERE id IN ('job-3', 'job-5') AND company = 'Vercel'");
    
    await run(`UPDATE jobs SET 
      company = 'Lancet General Hospital', 
      companyLogo = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSq1BXYmcuHKJA-7DZFsQO7B_2WsnkN75b8BeeJmcaNg&s=10', 
      title = 'Head of Nursing', 
      category = 'Nursing', 
      description = 'Lancet General Hospital is seeking a Head of Nursing to lead, manage, and coordinate our nursing staff team. You will ensure high standards of patient care, develop nursing care plans, and supervise shift schedules.', 
      requirements = '["5+ years of nursing experience with active nursing license","Superb leadership, communication, and organizing skills","Experience in clinical management or hospital operations","Ability to manage shifts and handle medical emergencies"]', 
      responsibilities = '["Supervise and coordinate the nursing staff team","Develop patient care plans and ensure compliance with medical standards","Manage shift schedules and address staff concerns","Provide guidance on nursing best practices"]' 
      WHERE id = 'job-4' AND company = 'Linear'`);

    // Seed default applications if empty
    const appsCount = await get('SELECT COUNT(*) as count FROM applications');
    if (parseInt(appsCount.count) === 0) {
      await run(`INSERT INTO applications (id, jobId, seekerEmail, status, resumeName, coverLetter, appliedDate) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['app-1', 'job-1', 'seeker@portal.com', 'Shortlisted', 'alex_johnson_resume.pdf', 'I am extremely excited about the Senior Front-End Architect position. With my 4+ years of frontend experience and strong knowledge of design systems, I can help Ride build beautiful and functional dashboards.', '2026-06-21']
      );
      await run(`INSERT INTO applications (id, jobId, seekerEmail, status, resumeName, coverLetter, appliedDate) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['app-2', 'job-3', 'seeker@portal.com', 'Applied', 'alex_johnson_resume.pdf', 'DevOps has always been my passion! Applying to manage Kubernetes and database clouds at Kelemat.', '2026-06-24']
      );
    } else {
      // Fix references in existing applications
      await run("UPDATE applications SET coverLetter = REPLACE(coverLetter, 'Stripe', 'Ride')");
      await run("UPDATE applications SET coverLetter = REPLACE(coverLetter, 'Vercel', 'Kelemat')");
    }

    // Seed default interviews if empty
    const intsCount = await get('SELECT COUNT(*) as count FROM interviews');
    if (parseInt(intsCount.count) === 0) {
      await run(`INSERT INTO interviews (id, applicationId, jobId, employerEmail, seekerEmail, dateTime, format, link, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['int-1', 'app-1', 'job-1', 'employer@portal.com', 'seeker@portal.com', '2026-07-02T10:00', 'Online (Google Meet)', 'https://meet.google.com/abc-defg-hij', '', 'Introductory engineering call. Please be prepared to discuss your previous experience building UI design systems.']
      );
    }

    // Seed default reports if empty
    const repsCount = await get('SELECT COUNT(*) as count FROM reports');
    if (parseInt(repsCount.count) === 0) {
      await run(`INSERT INTO reports (id, jobId, reporterEmail, reason, details, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['rep-1', 'job-4', 'testseeker@portal.com', 'Spam content', 'This posting links to an external survey site rather than a standard job application board.', 'Pending', '2026-06-25']
      );
    }

    console.log('PostgreSQL database check complete, schemas verified, and seeds verified.');
  } catch (err) {
    console.error('Failed to run database migrations:', err.message);
  }
};

module.exports = {
  pool,
  query,
  run,
  get,
  initDb
};
