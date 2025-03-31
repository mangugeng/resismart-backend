const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getTenants,
    getTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    getTenantStats,
    updateTenantSubscription
} = require('../controllers/tenantController');
const { validateTenant } = require('../middleware/validators');

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

// Semua route memerlukan autentikasi dan otorisasi admin
router.use(protect);
router.use(authorize('admin'));

// Routes
router.get('/', getTenants);
router.get('/stats', getTenantStats);
router.get('/:id', getTenant);

router.post('/',
    upload.single('logo'),
    validateTenant,
    createTenant
);

router.put('/:id',
    upload.single('logo'),
    validateTenant,
    updateTenant
);

router.patch('/:id/subscription',
    updateTenantSubscription
);

router.delete('/:id', deleteTenant);

module.exports = router; 