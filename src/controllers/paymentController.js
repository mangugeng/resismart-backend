const Payment = require('../models/Payment');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');
const User = require('../models/User');

// @desc    Get all payments with filter, search, and pagination
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `payments:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for payments list');
            return res.json(cachedData);
        }

        const result = await Payment.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            tenant: req.user.tenant,
            ...filters,
        });

        const response = {
            success: true,
            count: result.payments.length,
            pagination: result.pagination,
            data: result.payments,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting payments:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
const getPayment = async (req, res) => {
    try {
        const cacheKey = `payment:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for payment details');
            return res.json(cachedData);
        }

        const payment = await Payment.findById(req.params.id)
            .populate('tenant', 'name code')
            .populate('property', 'name')
            .populate('unit', 'number')
            .populate('resident', 'name email');

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Pembayaran tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (payment.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke data pembayaran ini.',
            });
        }

        const response = {
            success: true,
            data: payment,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting payment:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new payment
// @route   POST /api/payments
// @access  Private (Admin/Manager)
const createPayment = async (req, res) => {
    try {
        // Proses attachment jika ada
        if (req.files && req.files.length > 0) {
            req.body.attachments = await Promise.all(
                req.files.map(async (file) => {
                    const processedPath = await processImage(file);
                    return {
                        url: processedPath,
                        caption: file.originalname,
                        uploadedAt: new Date()
                    };
                })
            );
        }

        // Tambahkan tenant
        req.body.tenant = req.user.tenant;

        const payment = await Payment.create(req.body);

        // Kirim email notifikasi ke resident
        await sendEmail({
            email: payment.resident.email,
            subject: 'Pembayaran Baru',
            html: `
                <h2>Pembayaran Baru</h2>
                <p>Pembayaran baru telah dibuat dengan detail berikut:</p>
                <ul>
                    <li>Tipe: ${payment.type}</li>
                    <li>Jumlah: ${payment.amount} ${payment.currency}</li>
                    <li>Jatuh Tempo: ${new Date(payment.dueDate).toLocaleDateString()}</li>
                </ul>
                <a href="${process.env.FRONTEND_URL}/payments/${payment._id}">
                    Lihat Detail
                </a>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('payments:*');

        logger.info('New payment created:', payment._id);
        res.status(201).json({
            success: true,
            data: payment,
        });
    } catch (error) {
        logger.error('Error creating payment:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update payment status
// @route   PATCH /api/payments/:id/status
// @access  Private (Admin/Manager)
const updatePaymentStatus = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Pembayaran tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (payment.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate status pembayaran ini.',
            });
        }

        // Update status
        payment.status = req.body.status;
        if (req.body.status === 'completed') {
            payment.paidAt = new Date();
        }
        await payment.save();

        // Kirim email notifikasi ke resident
        await sendEmail({
            email: payment.resident.email,
            subject: 'Status Pembayaran Diupdate',
            html: `
                <h2>Status Pembayaran Diupdate</h2>
                <p>Status pembayaran Anda telah diupdate menjadi: ${payment.status}</p>
                <ul>
                    <li>Tipe: ${payment.type}</li>
                    <li>Jumlah: ${payment.amount} ${payment.currency}</li>
                    <li>Status: ${payment.status}</li>
                </ul>
                <a href="${process.env.FRONTEND_URL}/payments/${payment._id}">
                    Lihat Detail
                </a>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('payments:*');
        await deleteCache(`payment:${payment._id}`);

        logger.info('Payment status updated:', payment._id);
        res.json({
            success: true,
            data: payment,
        });
    } catch (error) {
        logger.error('Error updating payment status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private (Admin/Manager)
const getPaymentStats = async (req, res) => {
    try {
        const cacheKey = `payment:stats:${req.user.tenant}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for payment statistics');
            return res.json(cachedData);
        }

        const stats = await Payment.getPaymentStats(req.user.tenant);

        const response = {
            success: true,
            data: stats[0] || {
                totalPayments: 0,
                totalAmount: 0,
                completedPayments: 0,
                totalCompletedAmount: 0,
                overduePayments: 0,
                totalOverdueAmount: 0,
                typeDistribution: {},
                statusDistribution: {},
                paymentMethodDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting payment statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

module.exports = {
    getPayments,
    getPayment,
    createPayment,
    updatePaymentStatus,
    getPaymentStats
}; 