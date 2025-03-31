const Announcement = require('../models/Announcement');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');

// @desc    Get all announcements with filter, search, and pagination
// @route   GET /api/announcements
// @access  Private
const getAnnouncements = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `announcements:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for announcements list');
            return res.json(cachedData);
        }

        const result = await Announcement.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            tenant: req.user.tenant,
            ...filters,
        });

        const response = {
            success: true,
            count: result.announcements.length,
            pagination: result.pagination,
            data: result.announcements,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private
const getAnnouncement = async (req, res) => {
    try {
        const cacheKey = `announcement:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for announcement details');
            return res.json(cachedData);
        }

        const announcement = await Announcement.findById(req.params.id)
            .populate('tenant', 'name code')
            .populate('property', 'name')
            .populate('author', 'name email')
            .populate('views.user', 'name email');

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Pengumuman tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (announcement.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke data pengumuman ini.',
            });
        }

        // Tambahkan view jika belum pernah dilihat
        const hasViewed = announcement.views.some(
            view => view.user.toString() === req.user._id.toString()
        );

        if (!hasViewed) {
            announcement.views.push({
                user: req.user._id,
                viewedAt: new Date()
            });
            await announcement.save();
        }

        const response = {
            success: true,
            data: announcement,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new announcement
// @route   POST /api/announcements
// @access  Private (Admin/Manager)
const createAnnouncement = async (req, res) => {
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

        // Tambahkan tenant dan author
        req.body.tenant = req.user.tenant;
        req.body.author = req.user._id;

        const announcement = await Announcement.create(req.body);

        // Kirim email notifikasi ke target audience
        const targetUsers = await User.find({
            tenant: req.user.tenant,
            role: { $in: req.body.targetAudience === 'all' ? ['resident', 'staff'] : [req.body.targetAudience] }
        });

        await Promise.all(
            targetUsers.map(user =>
                sendEmail({
                    email: user.email,
                    subject: 'Pengumuman Baru',
                    html: `
                        <h2>Pengumuman Baru</h2>
                        <p>Pengumuman baru telah dibuat dengan detail berikut:</p>
                        <ul>
                            <li>Judul: ${announcement.title}</li>
                            <li>Tipe: ${announcement.type}</li>
                            <li>Prioritas: ${announcement.priority}</li>
                        </ul>
                        <a href="${process.env.FRONTEND_URL}/announcements/${announcement._id}">
                            Lihat Detail
                        </a>
                    `,
                })
            )
        );

        // Hapus cache yang terkait
        await deleteCache('announcements:*');

        logger.info('New announcement created:', announcement._id);
        res.status(201).json({
            success: true,
            data: announcement,
        });
    } catch (error) {
        logger.error('Error creating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private (Admin/Manager)
const updateAnnouncement = async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Pengumuman tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (announcement.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate pengumuman ini.',
            });
        }

        // Proses attachment baru jika ada
        if (req.files && req.files.length > 0) {
            const newAttachments = await Promise.all(
                req.files.map(async (file) => {
                    const processedPath = await processImage(file);
                    return {
                        url: processedPath,
                        caption: file.originalname,
                        uploadedAt: new Date()
                    };
                })
            );
            req.body.attachments = [...announcement.attachments, ...newAttachments];
        }

        // Update pengumuman
        Object.assign(announcement, req.body);
        await announcement.save();

        // Kirim email notifikasi ke target audience
        const targetUsers = await User.find({
            tenant: req.user.tenant,
            role: { $in: req.body.targetAudience === 'all' ? ['resident', 'staff'] : [req.body.targetAudience] }
        });

        await Promise.all(
            targetUsers.map(user =>
                sendEmail({
                    email: user.email,
                    subject: 'Pengumuman Diupdate',
                    html: `
                        <h2>Pengumuman Diupdate</h2>
                        <p>Pengumuman telah diupdate dengan detail berikut:</p>
                        <ul>
                            <li>Judul: ${announcement.title}</li>
                            <li>Tipe: ${announcement.type}</li>
                            <li>Prioritas: ${announcement.priority}</li>
                        </ul>
                        <a href="${process.env.FRONTEND_URL}/announcements/${announcement._id}">
                            Lihat Detail
                        </a>
                    `,
                })
            )
        );

        // Hapus cache yang terkait
        await deleteCache('announcements:*');
        await deleteCache(`announcement:${announcement._id}`);

        logger.info('Announcement updated:', announcement._id);
        res.json({
            success: true,
            data: announcement,
        });
    } catch (error) {
        logger.error('Error updating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private (Admin/Manager)
const deleteAnnouncement = async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Pengumuman tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (announcement.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk menghapus pengumuman ini.',
            });
        }

        // Soft delete
        announcement.isActive = false;
        await announcement.save();

        // Kirim email notifikasi ke target audience
        const targetUsers = await User.find({
            tenant: req.user.tenant,
            role: { $in: announcement.targetAudience === 'all' ? ['resident', 'staff'] : [announcement.targetAudience] }
        });

        await Promise.all(
            targetUsers.map(user =>
                sendEmail({
                    email: user.email,
                    subject: 'Pengumuman Dihapus',
                    html: `
                        <h2>Pengumuman Dihapus</h2>
                        <p>Pengumuman berikut telah dihapus:</p>
                        <ul>
                            <li>Judul: ${announcement.title}</li>
                            <li>Tipe: ${announcement.type}</li>
                        </ul>
                    `,
                })
            )
        );

        // Hapus cache yang terkait
        await deleteCache('announcements:*');
        await deleteCache(`announcement:${announcement._id}`);

        logger.info('Announcement deleted:', announcement._id);
        res.json({
            success: true,
            message: 'Pengumuman berhasil dihapus.',
        });
    } catch (error) {
        logger.error('Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get announcement statistics
// @route   GET /api/announcements/stats
// @access  Private (Admin/Manager)
const getAnnouncementStats = async (req, res) => {
    try {
        const cacheKey = `announcement:stats:${req.user.tenant}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for announcement statistics');
            return res.json(cachedData);
        }

        const stats = await Announcement.getAnnouncementStats(req.user.tenant);

        const response = {
            success: true,
            data: stats[0] || {
                totalAnnouncements: 0,
                totalViews: 0,
                uniqueViewers: 0,
                typeDistribution: {},
                priorityDistribution: {},
                statusDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting announcement statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

module.exports = {
    getAnnouncements,
    getAnnouncement,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getAnnouncementStats
}; 