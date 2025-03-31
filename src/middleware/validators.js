const { body, validationResult } = require('express-validator');

const validateProperty = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Nama properti harus diisi')
        .isLength({ min: 3 })
        .withMessage('Nama properti minimal 3 karakter'),

    body('address.street')
        .trim()
        .notEmpty()
        .withMessage('Alamat jalan harus diisi'),

    body('address.city')
        .trim()
        .notEmpty()
        .withMessage('Kota harus diisi'),

    body('address.state')
        .trim()
        .notEmpty()
        .withMessage('Provinsi harus diisi'),

    body('address.postalCode')
        .trim()
        .notEmpty()
        .withMessage('Kode pos harus diisi')
        .matches(/^\d{5}$/)
        .withMessage('Kode pos harus 5 digit angka'),

    body('totalUnits')
        .isInt({ min: 1 })
        .withMessage('Jumlah unit harus lebih dari 0'),

    body('contactInfo.phone')
        .trim()
        .notEmpty()
        .withMessage('Nomor telepon harus diisi')
        .matches(/^(\+62|62|0)8[1-9][0-9]{6,9}$/)
        .withMessage('Format nomor telepon tidak valid'),

    body('contactInfo.email')
        .trim()
        .notEmpty()
        .withMessage('Email harus diisi')
        .isEmail()
        .withMessage('Format email tidak valid'),

    // Validasi hasil
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        next();
    },
];

// Middleware untuk mengecek hasil validasi
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

// Validator untuk pengumuman
const validateAnnouncement = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Judul pengumuman harus diisi')
        .isLength({ min: 3, max: 100 })
        .withMessage('Judul pengumuman harus antara 3-100 karakter'),

    body('content')
        .trim()
        .notEmpty()
        .withMessage('Konten pengumuman harus diisi')
        .isLength({ min: 10 })
        .withMessage('Konten pengumuman minimal 10 karakter'),

    body('type')
        .isIn(['general', 'maintenance', 'event', 'emergency', 'other'])
        .withMessage('Tipe pengumuman tidak valid'),

    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high'])
        .withMessage('Prioritas pengumuman tidak valid'),

    body('targetAudience')
        .isIn(['all', 'residents', 'staff', 'management'])
        .withMessage('Target audience tidak valid'),

    body('schedule.startDate')
        .optional()
        .isISO8601()
        .withMessage('Format tanggal mulai tidak valid'),

    body('schedule.endDate')
        .optional()
        .isISO8601()
        .withMessage('Format tanggal selesai tidak valid')
        .custom((value, { req }) => {
            if (req.body.schedule.startDate && new Date(value) <= new Date(req.body.schedule.startDate)) {
                throw new Error('Tanggal selesai harus setelah tanggal mulai');
            }
            return true;
        }),

    body('schedule.isRecurring')
        .optional()
        .isBoolean()
        .withMessage('Format isRecurring tidak valid'),

    body('schedule.recurrence')
        .optional()
        .isIn(['daily', 'weekly', 'monthly', 'yearly'])
        .withMessage('Format recurrence tidak valid')
        .custom((value, { req }) => {
            if (req.body.schedule.isRecurring && !value) {
                throw new Error('Recurrence harus diisi jika isRecurring true');
            }
            return true;
        }),

    validate
];

// Validator untuk keluhan
const validateComplaint = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Judul keluhan harus diisi')
        .isLength({ min: 3, max: 100 })
        .withMessage('Judul keluhan harus antara 3-100 karakter'),

    body('description')
        .trim()
        .notEmpty()
        .withMessage('Deskripsi keluhan harus diisi')
        .isLength({ min: 10 })
        .withMessage('Deskripsi keluhan minimal 10 karakter'),

    body('category')
        .isIn(['maintenance', 'security', 'noise', 'cleanliness', 'other'])
        .withMessage('Kategori keluhan tidak valid'),

    body('priority')
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Prioritas keluhan tidak valid'),

    body('unit')
        .notEmpty()
        .withMessage('Unit harus dipilih'),

    validate
];

// Validator untuk pembayaran
const validatePayment = [
    body('type')
        .isIn(['rent', 'deposit', 'maintenance', 'utility', 'other'])
        .withMessage('Tipe pembayaran tidak valid'),

    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Jumlah pembayaran harus lebih dari 0'),

    body('currency')
        .isIn(['IDR', 'USD'])
        .withMessage('Mata uang tidak valid'),

    body('paymentMethod')
        .isIn(['bank_transfer', 'credit_card', 'e_wallet', 'cash'])
        .withMessage('Metode pembayaran tidak valid'),

    body('dueDate')
        .isISO8601()
        .withMessage('Format tanggal jatuh tempo tidak valid'),

    body('unit')
        .notEmpty()
        .withMessage('Unit harus dipilih'),

    body('resident')
        .notEmpty()
        .withMessage('Resident harus dipilih'),

    body('paymentDetails.bankName')
        .if(body('paymentMethod').equals('bank_transfer'))
        .notEmpty()
        .withMessage('Nama bank harus diisi'),

    body('paymentDetails.accountNumber')
        .if(body('paymentMethod').equals('bank_transfer'))
        .notEmpty()
        .withMessage('Nomor rekening harus diisi'),

    body('paymentDetails.accountName')
        .if(body('paymentMethod').equals('bank_transfer'))
        .notEmpty()
        .withMessage('Nama pemilik rekening harus diisi'),

    body('paymentDetails.cardNumber')
        .if(body('paymentMethod').equals('credit_card'))
        .notEmpty()
        .withMessage('Nomor kartu harus diisi'),

    body('paymentDetails.cardType')
        .if(body('paymentMethod').equals('credit_card'))
        .isIn(['visa', 'mastercard', 'amex'])
        .withMessage('Tipe kartu tidak valid'),

    body('paymentDetails.eWalletProvider')
        .if(body('paymentMethod').equals('e_wallet'))
        .isIn(['gopay', 'ovo', 'dana', 'linkaja'])
        .withMessage('Provider e-wallet tidak valid'),

    body('paymentDetails.eWalletNumber')
        .if(body('paymentMethod').equals('e_wallet'))
        .notEmpty()
        .withMessage('Nomor e-wallet harus diisi'),

    validate
];

// Validator untuk maintenance
const validateMaintenance = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Judul pemeliharaan harus diisi')
        .isLength({ min: 3, max: 100 })
        .withMessage('Judul pemeliharaan harus antara 3-100 karakter'),

    body('description')
        .trim()
        .notEmpty()
        .withMessage('Deskripsi pemeliharaan harus diisi')
        .isLength({ min: 10 })
        .withMessage('Deskripsi pemeliharaan minimal 10 karakter'),

    body('type')
        .isIn(['preventive', 'corrective', 'emergency', 'inspection'])
        .withMessage('Tipe pemeliharaan tidak valid'),

    body('priority')
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Prioritas pemeliharaan tidak valid'),

    body('category')
        .isIn(['plumbing', 'electrical', 'structural', 'appliance', 'pest_control', 'cleaning', 'other'])
        .withMessage('Kategori pemeliharaan tidak valid'),

    body('schedule.startDate')
        .isISO8601()
        .withMessage('Format tanggal mulai tidak valid'),

    body('schedule.endDate')
        .isISO8601()
        .withMessage('Format tanggal selesai tidak valid')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.schedule.startDate)) {
                throw new Error('Tanggal selesai harus setelah tanggal mulai');
            }
            return true;
        }),

    body('schedule.isRecurring')
        .optional()
        .isBoolean()
        .withMessage('Format isRecurring tidak valid'),

    body('schedule.recurrence')
        .optional()
        .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
        .withMessage('Format recurrence tidak valid')
        .custom((value, { req }) => {
            if (req.body.schedule.isRecurring && !value) {
                throw new Error('Recurrence harus diisi jika isRecurring true');
            }
            return true;
        }),

    body('cost.estimated')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Biaya estimasi harus lebih dari 0'),

    body('cost.actual')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Biaya aktual harus lebih dari 0'),

    body('cost.currency')
        .optional()
        .isIn(['IDR', 'USD'])
        .withMessage('Mata uang tidak valid'),

    body('unit')
        .notEmpty()
        .withMessage('Unit harus dipilih'),

    body('assignedTo')
        .optional()
        .notEmpty()
        .withMessage('Staff yang ditugaskan harus dipilih'),

    validate
];

module.exports = {
    validateProperty,
    validate,
    validateAnnouncement,
    validateComplaint,
    validatePayment,
    validateMaintenance
}; 