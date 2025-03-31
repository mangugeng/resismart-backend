const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getUserStats,
    updateUserPreferences,
    resetPassword
} = require('../controllers/userController');
const { validateUser } = require('../middleware/validators');

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
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diperbolehkan!'));
        }
    }
});

// Routes yang memerlukan autentikasi
router.use(protect);

// Routes untuk admin dan manager
router.get('/', authorize('admin', 'manager'), getUsers);
router.get('/stats', authorize('admin', 'manager'), getUserStats);
router.get('/:id', authorize('admin', 'manager'), getUser);

router.post('/',
    authorize('admin', 'manager'),
    upload.single('avatar'),
    validateUser,
    createUser
);

router.put('/:id',
    authorize('admin', 'manager'),
    upload.single('avatar'),
    validateUser,
    updateUser
);

router.delete('/:id', authorize('admin', 'manager'), deleteUser);

// Routes untuk pengguna
router.patch('/:id/preferences', updateUserPreferences);

// Route publik untuk reset password
router.post('/reset-password', resetPassword);

module.exports = router; 