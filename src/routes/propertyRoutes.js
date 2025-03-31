const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
    searchProperties,
    getPropertyStats
} = require('../controllers/propertyController');
const { validateProperty } = require('../middleware/validators');

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
router.get('/', getProperties);
router.get('/search', searchProperties);
router.get('/:id', getProperty);

// Protected routes
router.use(protect);

// Admin routes
router.get('/stats', authorize('admin'), getPropertyStats);

// Property Manager & Admin routes
router.post('/',
    authorize('admin', 'property_manager'),
    upload.array('images', 5),
    validateProperty,
    createProperty
);

router.put('/:id',
    authorize('admin', 'property_manager'),
    upload.array('images', 5),
    validateProperty,
    updateProperty
);

router.delete('/:id', authorize('admin'), deleteProperty);

module.exports = router; 