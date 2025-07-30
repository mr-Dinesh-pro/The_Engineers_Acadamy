// GATE Preparation Platform Backend
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MongoDB Connection ---
mongoose.connect('mongodb://localhost:27017/gateprep', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// --- Models ---
const courseSchema = new mongoose.Schema({
  title: String,
  branch: String,
  description: String,
  topics: [String],
  syllabusUrl: String,
  price: Number,
});

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: String,
  otp: String, // for password reset
  otpExpires: Date,
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }]
});

const Course = mongoose.model('Course', courseSchema);
const User = mongoose.model('User', userSchema);

// --- File Upload (Multer) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// --- Auth Helpers ---
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
function generateToken(user) {
  return jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    const token = auth.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Dummy Data (populate if empty) ---
async function populateDummyCourses() {
  const count = await Course.countDocuments();
  if (count > 0) return;
  const dummy = [
    // CSE
    { title: 'GATE 2026 - CSE Full Syllabus', branch: 'CSE', description: 'Comprehensive CSE course.', topics: ['Algorithms', 'Data Structures', 'OS', 'DBMS'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - CSE Crash Course', branch: 'CSE', description: 'Crash course for CSE.', topics: ['Networks', 'Compiler', 'Digital Logic'], syllabusUrl: '', price: 2999 },
    // ECE
    { title: 'GATE 2026 - ECE Full Syllabus', branch: 'ECE', description: 'Full ECE course.', topics: ['Signals', 'Networks', 'Analog Circuits'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - ECE Practice Series', branch: 'ECE', description: 'Practice for ECE.', topics: ['Microprocessors', 'Communication'], syllabusUrl: '', price: 1999 },
    // ME
    { title: 'GATE 2026 - ME Full Syllabus', branch: 'ME', description: 'Full ME course.', topics: ['Thermodynamics', 'Fluid Mechanics'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - ME Crash Course', branch: 'ME', description: 'Crash course for ME.', topics: ['Strength of Materials', 'Heat Transfer'], syllabusUrl: '', price: 2999 },
    // CE
    { title: 'GATE 2026 - CE Full Syllabus', branch: 'CE', description: 'Full CE course.', topics: ['Structural', 'Geotechnical'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - CE Practice Series', branch: 'CE', description: 'Practice for CE.', topics: ['Environmental', 'Surveying'], syllabusUrl: '', price: 1999 },
    // EE
    { title: 'GATE 2026 - EE Full Syllabus', branch: 'EE', description: 'Full EE course.', topics: ['Power Systems', 'Machines'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - EE Crash Course', branch: 'EE', description: 'Crash course for EE.', topics: ['Power Electronics', 'Analog Circuits'], syllabusUrl: '', price: 2999 },
    // IN
    { title: 'GATE 2026 - IN Full Syllabus', branch: 'IN', description: 'Full IN course.', topics: ['Transducers', 'Control Systems'], syllabusUrl: '', price: 4999 },
    { title: 'GATE 2026 - IN Practice Series', branch: 'IN', description: 'Practice for IN.', topics: ['Sensors', 'Process Control'], syllabusUrl: '', price: 1999 },
  ];
  await Course.insertMany(dummy);
}
populateDummyCourses();

// --- Branches ---
const BRANCHES = ['CSE', 'ECE', 'ME', 'CE', 'EE', 'IN'];

// --- API Endpoints ---
// 1. Get all branches
app.get('/api/branches', (req, res) => {
  res.json(BRANCHES);
});

// 2. CRUD for courses
app.get('/api/courses', async (req, res) => {
  // Filtering by branch, pagination
  const { branch, page = 1, limit = 20 } = req.query;
  const filter = branch && branch !== 'ALL' ? { branch } : {};
  const courses = await Course.find(filter).skip((page-1)*limit).limit(Number(limit));
  res.json(courses);
});

app.get('/api/courses/:id', async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ error: 'Not found' });
  res.json(course);
});

app.post('/api/courses', upload.single('syllabus'), async (req, res) => {
  const { title, branch, description, topics, price } = req.body;
  let syllabusUrl = '';
  if (req.file) {
    syllabusUrl = `/uploads/${req.file.filename}`;
  }
  const course = new Course({
    title,
    branch,
    description,
    topics: typeof topics === 'string' ? topics.split(',').map(t=>t.trim()) : topics,
    syllabusUrl,
    price: price ? Number(price) : undefined
  });
  await course.save();
  res.status(201).json(course);
});

app.put('/api/courses/:id', upload.single('syllabus'), async (req, res) => {
  const { title, branch, description, topics, price } = req.body;
  let syllabusUrl = undefined;
  if (req.file) {
    syllabusUrl = `/uploads/${req.file.filename}`;
  }
  const update = {
    title, branch, description,
    topics: typeof topics === 'string' ? topics.split(',').map(t=>t.trim()) : topics,
    price: price ? Number(price) : undefined
  };
  if (syllabusUrl) update.syllabusUrl = syllabusUrl;
  const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!course) return res.status(404).json({ error: 'Not found' });
  res.json(course);
});

app.delete('/api/courses/:id', async (req, res) => {
  await Course.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// 3. Search
app.get('/api/courses/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const regex = new RegExp(q, 'i');
  const courses = await Course.find({
    $or: [
      { title: regex },
      { topics: regex }
    ]
  });
  res.json(courses);
});

// 4. Bookmark system (requires auth)
app.post('/api/users/register', async (req, res) => {
  const { phone, email, password, repassword } = req.body;
  if (!phone || !email || !password || !repassword) return res.status(400).json({ error: 'Missing fields' });
  if (password !== repassword) return res.status(400).json({ error: 'Passwords do not match' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ phone, email, password: hash });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 11000) {
      if (e.keyPattern.phone) return res.status(400).json({ error: 'Phone already registered' });
      if (e.keyPattern.email) return res.status(400).json({ error: 'Email already registered' });
    }
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/users/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'Missing fields' });
  // identifier can be phone or email
  const user = await User.findOne({ $or: [ { phone: identifier }, { email: identifier } ] });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
  res.json({ success: true });
});

// Add bookmark
app.post('/api/users/bookmarks/:courseId', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Not found' });
  if (!user.bookmarks.includes(req.params.courseId)) {
    user.bookmarks.push(req.params.courseId);
    await user.save();
  }
  res.json({ success: true });
});
// Remove bookmark
app.delete('/api/users/bookmarks/:courseId', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Not found' });
  user.bookmarks = user.bookmarks.filter(id => id.toString() !== req.params.courseId);
  await user.save();
  res.json({ success: true });
});
// Get bookmarks
app.get('/api/users/bookmarks', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).populate('bookmarks');
  if (!user) return res.status(401).json({ error: 'Not found' });
  res.json(user.bookmarks);
});

// --- Request OTP for password reset ---
app.post('/api/users/request-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Missing phone' });
  const user = await User.findOne({ phone });
  if (!user) return res.status(400).json({ error: 'User not found' });
  // Generate OTP (simulate Python random generator)
  // In real use: exec('python -c "import random; print(random.randint(100000,999999))"', ...)
  // For now, use JS:
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
  await user.save();
  // Simulate sending SMS (log to console)
  console.log(`OTP for ${phone}: ${otp}`);
  res.json({ success: true });
});

// --- Verify OTP ---
app.post('/api/users/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Missing fields' });
  const user = await User.findOne({ phone });
  if (!user || !user.otp || !user.otpExpires) return res.status(400).json({ error: 'OTP not requested' });
  if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (user.otpExpires < new Date()) return res.status(400).json({ error: 'OTP expired' });
  res.json({ success: true });
});

// --- Password Reset (after OTP verification) ---
app.post('/api/users/reset-password', async (req, res) => {
  const { phone, newpassword, otp } = req.body;
  if (!phone || !newpassword || !otp) return res.status(400).json({ error: 'Missing fields' });
  const user = await User.findOne({ phone });
  if (!user) return res.status(400).json({ error: 'User not found' });
  if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (user.otpExpires < new Date()) return res.status(400).json({ error: 'OTP expired' });
  const hash = await bcrypt.hash(newpassword, 10);
  user.password = hash;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();
  res.json({ success: true });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`GATE Prep backend running on http://localhost:${PORT}`);
}); 