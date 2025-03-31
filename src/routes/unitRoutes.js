const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit,
    getUnitStats,
    updateUnitStatus
} = require('../controllers/unitController');
const { validateUnit } = require('../middleware/validators');

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

// Public routes
router.get('/', getUnits);
router.get('/:id', getUnit);

// Protected routes
router.use(protect);

// Admin & Property Manager routes
router.get('/stats/:propertyId', authorize('admin', 'property_manager'), getUnitStats);

// Property Manager & Admin routes
router.post('/',
    authorize('admin', 'property_manager'),
    upload.array('images', 5),
    validateUnit,
    createUnit
);

router.put('/:id',
    authorize('admin', 'property_manager'),
    upload.array('images', 5),
    validateUnit,
    updateUnit
);

router.patch('/:id/status',
    authorize('admin', 'property_manager'),
    updateUnitStatus
);

router.delete('/:id', authorize('admin'), deleteUnit);

module.exports = router; 