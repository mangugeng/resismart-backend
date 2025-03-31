const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getComplaints,
    getComplaint,
    createComplaint,
    updateComplaintStatus,
    addComment,
    submitFeedback,
    getComplaintStats
} = require('../controllers/complaintController');
const { validateComplaint } = require('../middleware/validators');

// Konfigurasi multer untuk upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Hanya file gambar dan PDF yang diperbolehkan!'));
        }
    }
});

// Routes yang memerlukan autentikasi
router.use(protect);

// Routes untuk semua pengguna terautentikasi
router.get('/', getComplaints);
router.get('/:id', getComplaint);

// Routes untuk resident
router.post('/',
    authorize('resident'),
    upload.array('attachments', 5),
    validateComplaint,
    createComplaint
);

router.post('/:id/feedback',
    authorize('resident'),
    submitFeedback
);

// Routes untuk admin, manager, dan staff
router.patch('/:id/status',
    authorize('admin', 'manager', 'staff'),
    updateComplaintStatus
);

// Routes untuk semua pengguna terautentikasi
router.post('/:id/comments',
    upload.array('attachments', 3),
    addComment
);

router.get('/stats',
    authorize('admin', 'manager'),
    getComplaintStats
);

module.exports = router; 