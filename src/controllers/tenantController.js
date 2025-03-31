const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');

// @desc    Get all tenants with filter, search, and pagination
// @route   GET /api/tenants
// @access  Private (Admin)
const getTenants = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `tenants:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for tenants list');
            return res.json(cachedData);
        }

        const result = await Tenant.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            ...filters,
        });

        const response = {
            success: true,
            count: result.tenants.length,
            pagination: result.pagination,
            data: result.tenants,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting tenants:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single tenant
// @route   GET /api/tenants/:id
// @access  Private (Admin)
const getTenant = async (req, res) => {
    try {
        const cacheKey = `tenant:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for tenant details');
            return res.json(cachedData);
        }

        const tenant = await Tenant.findById(req.params.id);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant tidak ditemukan.',
            });
        }

        const response = {
            success: true,
            data: tenant,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting tenant:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new tenant
// @route   POST /api/tenants
// @access  Private (Admin)
const createTenant = async (req, res) => {
    try {
        // Proses logo jika ada
        if (req.file) {
            const processedPath = await processImage(req.file);
            req.body.logo = {
                url: processedPath,
                caption: req.body.logoCaption || ''
            };
        }

        const tenant = await Tenant.create(req.body);

        // Kirim email notifikasi
        await sendEmail({
            email: tenant.contactInfo.email,
            subject: 'Selamat Datang di ResiSmart',
            html: `
                <h2>Selamat Datang di ResiSmart</h2>
                <p>Terima kasih telah bergabung dengan ResiSmart. Berikut adalah detail akun Anda:</p>
                <ul>
                    <li>Nama: ${tenant.name}</li>
                    <li>Kode: ${tenant.code}</li>
                    <li>Email: ${tenant.contactInfo.email}</li>
                    <li>Paket: ${tenant.subscription.plan}</li>
                    <li>Tanggal Mulai: ${tenant.subscription.startDate.toLocaleDateString()}</li>
                    <li>Tanggal Selesai: ${tenant.subscription.endDate.toLocaleDateString()}</li>
                </ul>
                <p>Silakan login ke dashboard Anda untuk mulai menggunakan layanan kami.</p>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('tenants:*');

        logger.info('New tenant created:', tenant._id);
        res.status(201).json({
            success: true,
            data: tenant,
        });
    } catch (error) {
        logger.error('Error creating tenant:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update tenant
// @route   PUT /api/tenants/:id
// @access  Private (Admin)
const updateTenant = async (req, res) => {
    try {
        // Proses logo baru jika ada
        if (req.file) {
            const processedPath = await processImage(req.file);
            req.body.logo = {
                url: processedPath,
                caption: req.body.logoCaption || ''
            };
        }

        const tenant = await Tenant.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant tidak ditemukan.',
            });
        }

        // Kirim email notifikasi
        await sendEmail({
            email: tenant.contactInfo.email,
            subject: 'Profil Tenant Diupdate',
            html: `
                <h2>Profil Tenant Diupdate</h2>
                <p>Profil tenant Anda telah diupdate. Berikut adalah detail terbaru:</p>
                <ul>
                    <li>Nama: ${tenant.name}</li>
                    <li>Kode: ${tenant.code}</li>
                    <li>Email: ${tenant.contactInfo.email}</li>
                    <li>Paket: ${tenant.subscription.plan}</li>
                    <li>Status: ${tenant.subscription.status}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('tenants:*');
        await deleteCache(`tenant:${tenant._id}`);

        logger.info('Tenant updated:', tenant._id);
        res.json({
            success: true,
            data: tenant,
        });
    } catch (error) {
        logger.error('Error updating tenant:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Delete tenant
// @route   DELETE /api/tenants/:id
// @access  Private (Admin)
const deleteTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant tidak ditemukan.',
            });
        }

        // Soft delete
        tenant.isActive = false;
        await tenant.save();

        // Kirim email notifikasi
        await sendEmail({
            email: tenant.contactInfo.email,
            subject: 'Akun Tenant Dinonaktifkan',
            html: `
                <h2>Akun Tenant Dinonaktifkan</h2>
                <p>Akun tenant Anda telah dinonaktifkan. Berikut adalah detail:</p>
                <ul>
                    <li>Nama: ${tenant.name}</li>
                    <li>Kode: ${tenant.code}</li>
                    <li>Email: ${tenant.contactInfo.email}</li>
                </ul>
                <p>Jika Anda memiliki pertanyaan, silakan hubungi tim support kami.</p>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('tenants:*');
        await deleteCache(`tenant:${tenant._id}`);

        logger.info('Tenant deleted:', tenant._id);
        res.json({
            success: true,
            message: 'Tenant berhasil dihapus.',
        });
    } catch (error) {
        logger.error('Error deleting tenant:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get tenant statistics
// @route   GET /api/tenants/stats
// @access  Private (Admin)
const getTenantStats = async (req, res) => {
    try {
        const cacheKey = 'tenant:stats';

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for tenant statistics');
            return res.json(cachedData);
        }

        const stats = await Tenant.getTenantStats();

        const response = {
            success: true,
            data: stats[0] || {
                totalTenants: 0,
                activeTenants: 0,
                planDistribution: {},
                statusDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting tenant statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

// @desc    Update tenant subscription
// @route   PATCH /api/tenants/:id/subscription
// @access  Private (Admin)
const updateTenantSubscription = async (req, res) => {
    try {
        const { plan, startDate, endDate, status } = req.body;
        const tenant = await Tenant.findById(req.params.id);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant tidak ditemukan.',
            });
        }

        // Update subscription
        tenant.subscription = {
            ...tenant.subscription,
            plan,
            startDate,
            endDate,
            status
        };

        await tenant.save();

        // Kirim email notifikasi
        await sendEmail({
            email: tenant.contactInfo.email,
            subject: 'Paket Langganan Diupdate',
            html: `
                <h2>Paket Langganan Diupdate</h2>
                <p>Paket langganan Anda telah diupdate. Berikut adalah detail terbaru:</p>
                <ul>
                    <li>Nama: ${tenant.name}</li>
                    <li>Paket: ${plan}</li>
                    <li>Tanggal Mulai: ${startDate.toLocaleDateString()}</li>
                    <li>Tanggal Selesai: ${endDate.toLocaleDateString()}</li>
                    <li>Status: ${status}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('tenants:*');
        await deleteCache(`tenant:${tenant._id}`);

        logger.info('Tenant subscription updated:', tenant._id);
        res.json({
            success: true,
            data: tenant,
        });
    } catch (error) {
        logger.error('Error updating tenant subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

module.exports = {
    getTenants,
    getTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    getTenantStats,
    updateTenantSubscription
}; 