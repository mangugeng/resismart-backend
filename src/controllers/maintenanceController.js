const Maintenance = require('../models/Maintenance');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');
const User = require('../models/User');

// @desc    Get all maintenance tasks with filter, search, and pagination
// @route   GET /api/maintenance
// @access  Private
const getMaintenanceTasks = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `maintenance:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for maintenance list');
            return res.json(cachedData);
        }

        const result = await Maintenance.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            tenant: req.user.tenant,
            ...filters,
        });

        const response = {
            success: true,
            count: result.maintenances.length,
            pagination: result.pagination,
            data: result.maintenances,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting maintenance tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single maintenance task
// @route   GET /api/maintenance/:id
// @access  Private
const getMaintenanceTask = async (req, res) => {
    try {
        const cacheKey = `maintenance:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for maintenance details');
            return res.json(cachedData);
        }

        const maintenance = await Maintenance.findById(req.params.id)
            .populate('tenant', 'name code')
            .populate('property', 'name')
            .populate('unit', 'number')
            .populate('assignedTo', 'name email')
            .populate('completedBy', 'name email');

        if (!maintenance) {
            return res.status(404).json({
                success: false,
                message: 'Tugas pemeliharaan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (maintenance.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke data pemeliharaan ini.',
            });
        }

        const response = {
            success: true,
            data: maintenance,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting maintenance task:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new maintenance task
// @route   POST /api/maintenance
// @access  Private (Admin/Manager)
const createMaintenanceTask = async (req, res) => {
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

        const maintenance = await Maintenance.create(req.body);

        // Kirim email notifikasi ke staff yang ditugaskan
        if (maintenance.assignedTo) {
            const assignedStaff = await User.findById(maintenance.assignedTo);
            await sendEmail({
                email: assignedStaff.email,
                subject: 'Tugas Pemeliharaan Baru',
                html: `
                    <h2>Tugas Pemeliharaan Baru</h2>
                    <p>Anda telah ditugaskan untuk melakukan pemeliharaan dengan detail berikut:</p>
                    <ul>
                        <li>Judul: ${maintenance.title}</li>
                        <li>Tipe: ${maintenance.type}</li>
                        <li>Prioritas: ${maintenance.priority}</li>
                        <li>Jadwal: ${new Date(maintenance.schedule.startDate).toLocaleDateString()} - ${new Date(maintenance.schedule.endDate).toLocaleDateString()}</li>
                    </ul>
                    <a href="${process.env.FRONTEND_URL}/maintenance/${maintenance._id}">
                        Lihat Detail
                    </a>
                `,
            });
        }

        // Hapus cache yang terkait
        await deleteCache('maintenance:*');

        logger.info('New maintenance task created:', maintenance._id);
        res.status(201).json({
            success: true,
            data: maintenance,
        });
    } catch (error) {
        logger.error('Error creating maintenance task:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update maintenance task status
// @route   PATCH /api/maintenance/:id/status
// @access  Private (Admin/Manager)
const updateMaintenanceStatus = async (req, res) => {
    try {
        const maintenance = await Maintenance.findById(req.params.id);

        if (!maintenance) {
            return res.status(404).json({
                success: false,
                message: 'Tugas pemeliharaan tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (maintenance.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate status pemeliharaan ini.',
            });
        }

        // Update status
        maintenance.status = req.body.status;
        if (req.body.status === 'completed') {
            maintenance.completedAt = new Date();
            maintenance.completedBy = req.user._id;
        }
        await maintenance.save();

        // Kirim email notifikasi ke staff yang ditugaskan
        if (maintenance.assignedTo) {
            const assignedStaff = await User.findById(maintenance.assignedTo);
            await sendEmail({
                email: assignedStaff.email,
                subject: 'Status Pemeliharaan Diupdate',
                html: `
                    <h2>Status Pemeliharaan Diupdate</h2>
                    <p>Status pemeliharaan telah diupdate menjadi: ${maintenance.status}</p>
                    <ul>
                        <li>Judul: ${maintenance.title}</li>
                        <li>Status: ${maintenance.status}</li>
                    </ul>
                    <a href="${process.env.FRONTEND_URL}/maintenance/${maintenance._id}">
                        Lihat Detail
                    </a>
                `,
            });
        }

        // Hapus cache yang terkait
        await deleteCache('maintenance:*');
        await deleteCache(`maintenance:${maintenance._id}`);

        logger.info('Maintenance status updated:', maintenance._id);
        res.json({
            success: true,
            data: maintenance,
        });
    } catch (error) {
        logger.error('Error updating maintenance status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get maintenance statistics
// @route   GET /api/maintenance/stats
// @access  Private (Admin/Manager)
const getMaintenanceStats = async (req, res) => {
    try {
        const cacheKey = `maintenance:stats:${req.user.tenant}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for maintenance statistics');
            return res.json(cachedData);
        }

        const stats = await Maintenance.getMaintenanceStats(req.user.tenant);

        const response = {
            success: true,
            data: stats[0] || {
                totalMaintenance: 0,
                completedMaintenance: 0,
                totalCost: 0,
                averageCost: 0,
                overdueMaintenance: 0,
                typeDistribution: {},
                priorityDistribution: {},
                statusDistribution: {},
                categoryDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting maintenance statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

module.exports = {
    getMaintenanceTasks,
    getMaintenanceTask,
    createMaintenanceTask,
    updateMaintenanceStatus,
    getMaintenanceStats
}; 