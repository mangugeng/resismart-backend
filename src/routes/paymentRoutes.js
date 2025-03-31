const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getPayments,
    getPayment,
    createPayment,
    updatePaymentStatus,
    getPaymentStats
} = require('../controllers/paymentController');
const { validatePayment } = require('../middleware/validators');

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
router.get('/', getPayments);
router.get('/:id', getPayment);

// Routes untuk admin dan manager
router.post('/',
    authorize('admin', 'manager'),
    upload.array('attachments', 5),
    validatePayment,
    createPayment
);

router.patch('/:id/status',
    authorize('admin', 'manager'),
    updatePaymentStatus
);

router.get('/stats',
    authorize('admin', 'manager'),
    getPaymentStats
);

module.exports = router; 