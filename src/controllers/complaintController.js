const Complaint = require('../models/Complaint');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');
const User = require('../models/User');

// @desc    Get all complaints with filter, search, and pagination
// @route   GET /api/complaints
// @access  Private
const getComplaints = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `complaints:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for complaints list');
            return res.json(cachedData);
        }

        const result = await Complaint.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            tenant: req.user.tenant,
            ...filters,
        });

        const response = {
            success: true,
            count: result.complaints.length,
            pagination: result.pagination,
            data: result.complaints,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting complaints:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single complaint
// @route   GET /api/complaints/:id
// @access  Private
const getComplaint = async (req, res) => {
    try {
        const cacheKey = `complaint:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for complaint details');
            return res.json(cachedData);
        }

        const complaint = await Complaint.findById(req.params.id)
            .populate('tenant', 'name code')
            .populate('property', 'name')
            .populate('unit', 'number')
            .populate('resident', 'name email')
            .populate('assignedTo', 'name email')
            .populate('comments.user', 'name email')
            .populate('resolution.resolvedBy', 'name email');

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Keluhan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (complaint.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke data keluhan ini.',
            });
        }

        const response = {
            success: true,
            data: complaint,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting complaint:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new complaint
// @route   POST /api/complaints
// @access  Private (Resident)
const createComplaint = async (req, res) => {
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

        // Tambahkan tenant dan resident
        req.body.tenant = req.user.tenant;
        req.body.resident = req.user._id;

        const complaint = await Complaint.create(req.body);

        // Kirim email notifikasi ke staff
        const staffUsers = await User.find({
            tenant: req.user.tenant,
            role: { $in: ['admin', 'manager', 'staff'] }
        });

        await Promise.all(
            staffUsers.map(user =>
                sendEmail({
                    email: user.email,
                    subject: 'Keluhan Baru',
                    html: `
                        <h2>Keluhan Baru</h2>
                        <p>Keluhan baru telah dibuat dengan detail berikut:</p>
                        <ul>
                            <li>Judul: ${complaint.title}</li>
                            <li>Kategori: ${complaint.category}</li>
                            <li>Prioritas: ${complaint.priority}</li>
                        </ul>
                        <a href="${process.env.FRONTEND_URL}/complaints/${complaint._id}">
                            Lihat Detail
                        </a>
                    `,
                })
            )
        );

        // Hapus cache yang terkait
        await deleteCache('complaints:*');

        logger.info('New complaint created:', complaint._id);
        res.status(201).json({
            success: true,
            data: complaint,
        });
    } catch (error) {
        logger.error('Error creating complaint:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update complaint status
// @route   PATCH /api/complaints/:id/status
// @access  Private (Admin/Manager/Staff)
const updateComplaintStatus = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Keluhan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (complaint.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate status keluhan ini.',
            });
        }

        // Update status
        complaint.status = req.body.status;
        if (req.body.status === 'resolved') {
            complaint.resolution = {
                resolvedBy: req.user._id,
                resolvedAt: new Date(),
                notes: req.body.notes
            };
        }
        await complaint.save();

        // Kirim email notifikasi ke resident
        await sendEmail({
            email: complaint.resident.email,
            subject: 'Status Keluhan Diupdate',
            html: `
                <h2>Status Keluhan Diupdate</h2>
                <p>Status keluhan Anda telah diupdate menjadi: ${complaint.status}</p>
                <ul>
                    <li>Judul: ${complaint.title}</li>
                    <li>Status: ${complaint.status}</li>
                </ul>
                <a href="${process.env.FRONTEND_URL}/complaints/${complaint._id}">
                    Lihat Detail
                </a>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('complaints:*');
        await deleteCache(`complaint:${complaint._id}`);

        logger.info('Complaint status updated:', complaint._id);
        res.json({
            success: true,
            data: complaint,
        });
    } catch (error) {
        logger.error('Error updating complaint status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Add comment to complaint
// @route   POST /api/complaints/:id/comments
// @access  Private
const addComment = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Keluhan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (complaint.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk menambahkan komentar pada keluhan ini.',
            });
        }

        // Proses attachment jika ada
        let attachments = [];
        if (req.files && req.files.length > 0) {
            attachments = await Promise.all(
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

        // Tambahkan komentar
        complaint.comments.push({
            user: req.user._id,
            content: req.body.content,
            attachments
        });
        await complaint.save();

        // Kirim email notifikasi
        const recipient = req.user._id.toString() === complaint.resident.toString()
            ? complaint.assignedTo
            : complaint.resident;

        if (recipient) {
            await sendEmail({
                email: recipient.email,
                subject: 'Komentar Baru pada Keluhan',
                html: `
                    <h2>Komentar Baru</h2>
                    <p>Komentar baru telah ditambahkan pada keluhan:</p>
                    <ul>
                        <li>Judul: ${complaint.title}</li>
                        <li>Komentar: ${req.body.content}</li>
                    </ul>
                    <a href="${process.env.FRONTEND_URL}/complaints/${complaint._id}">
                        Lihat Detail
                    </a>
                `,
            });
        }

        // Hapus cache yang terkait
        await deleteCache(`complaint:${complaint._id}`);

        logger.info('Comment added to complaint:', complaint._id);
        res.json({
            success: true,
            data: complaint,
        });
    } catch (error) {
        logger.error('Error adding comment:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Submit feedback for complaint
// @route   POST /api/complaints/:id/feedback
// @access  Private (Resident)
const submitFeedback = async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Keluhan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (complaint.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk memberikan feedback pada keluhan ini.',
            });
        }

        // Cek apakah keluhan sudah diselesaikan
        if (complaint.status !== 'resolved') {
            return res.status(400).json({
                success: false,
                message: 'Feedback hanya dapat diberikan untuk keluhan yang sudah diselesaikan.',
            });
        }

        // Cek apakah sudah pernah memberikan feedback
        if (complaint.feedback) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah memberikan feedback untuk keluhan ini.',
            });
        }

        // Tambahkan feedback
        complaint.feedback = {
            rating: req.body.rating,
            comment: req.body.comment,
            submittedAt: new Date()
        };
        await complaint.save();

        // Kirim email notifikasi ke staff
        const staffUsers = await User.find({
            tenant: req.user.tenant,
            role: { $in: ['admin', 'manager', 'staff'] }
        });

        await Promise.all(
            staffUsers.map(user =>
                sendEmail({
                    email: user.email,
                    subject: 'Feedback Baru untuk Keluhan',
                    html: `
                        <h2>Feedback Baru</h2>
                        <p>Feedback baru telah diterima untuk keluhan:</p>
                        <ul>
                            <li>Judul: ${complaint.title}</li>
                            <li>Rating: ${req.body.rating}/5</li>
                            <li>Komentar: ${req.body.comment}</li>
                        </ul>
                        <a href="${process.env.FRONTEND_URL}/complaints/${complaint._id}">
                            Lihat Detail
                        </a>
                    `,
                })
            )
        );

        // Hapus cache yang terkait
        await deleteCache('complaints:*');
        await deleteCache(`complaint:${complaint._id}`);

        logger.info('Feedback submitted for complaint:', complaint._id);
        res.json({
            success: true,
            data: complaint,
        });
    } catch (error) {
        logger.error('Error submitting feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get complaint statistics
// @route   GET /api/complaints/stats
// @access  Private (Admin/Manager)
const getComplaintStats = async (req, res) => {
    try {
        const cacheKey = `complaint:stats:${req.user.tenant}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for complaint statistics');
            return res.json(cachedData);
        }

        const stats = await Complaint.getComplaintStats(req.user.tenant);

        const response = {
            success: true,
            data: stats[0] || {
                totalComplaints: 0,
                resolvedComplaints: 0,
                averageResolutionTime: 0,
                averageRating: 0,
                categoryDistribution: {},
                priorityDistribution: {},
                statusDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting complaint statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

module.exports = {
    getComplaints,
    getComplaint,
    createComplaint,
    updateComplaintStatus,
    addComment,
    submitFeedback,
    getComplaintStats
}; 