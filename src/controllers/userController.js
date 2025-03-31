const User = require('../models/User');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');
const crypto = require('crypto');

// @desc    Get all users with filter, search, and pagination
// @route   GET /api/users
// @access  Private (Admin/Manager)
const getUsers = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `users:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for users list');
            return res.json(cachedData);
        }

        const result = await User.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            tenant: req.user.tenant,
            ...filters,
        });

        const response = {
            success: true,
            count: result.users.length,
            pagination: result.pagination,
            data: result.users,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin/Manager)
const getUser = async (req, res) => {
    try {
        const cacheKey = `user:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for user details');
            return res.json(cachedData);
        }

        const user = await User.findById(req.params.id)
            .select('+password')
            .populate('tenant', 'name code');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (user.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke data pengguna ini.',
            });
        }

        const response = {
            success: true,
            data: user,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting user:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private (Admin/Manager)
const createUser = async (req, res) => {
    try {
        // Proses avatar jika ada
        if (req.file) {
            const processedPath = await processImage(req.file);
            req.body.avatar = {
                url: processedPath,
                caption: req.body.avatarCaption || ''
            };
        }

        // Tambahkan tenant dari user yang membuat
        req.body.tenant = req.user.tenant;

        const user = await User.create(req.body);

        // Kirim email verifikasi
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = crypto
            .createHash('sha256')
            .update(verificationToken)
            .digest('hex');
        user.verificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 jam

        await user.save();

        // Kirim email verifikasi
        await sendEmail({
            email: user.email,
            subject: 'Verifikasi Email Anda',
            html: `
                <h2>Verifikasi Email Anda</h2>
                <p>Terima kasih telah mendaftar. Silakan klik link di bawah ini untuk memverifikasi email Anda:</p>
                <a href="${process.env.FRONTEND_URL}/verify-email/${verificationToken}">
                    Verifikasi Email
                </a>
                <p>Link ini akan kadaluarsa dalam 24 jam.</p>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('users:*');

        logger.info('New user created:', user._id);
        res.status(201).json({
            success: true,
            data: user,
        });
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin/Manager)
const updateUser = async (req, res) => {
    try {
        // Proses avatar baru jika ada
        if (req.file) {
            const processedPath = await processImage(req.file);
            req.body.avatar = {
                url: processedPath,
                caption: req.body.avatarCaption || ''
            };
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (user.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate pengguna ini.',
            });
        }

        // Update user
        Object.keys(req.body).forEach(key => {
            user[key] = req.body[key];
        });

        await user.save();

        // Kirim email notifikasi
        await sendEmail({
            email: user.email,
            subject: 'Profil Diupdate',
            html: `
                <h2>Profil Diupdate</h2>
                <p>Profil Anda telah diupdate. Berikut adalah detail terbaru:</p>
                <ul>
                    <li>Nama: ${user.name}</li>
                    <li>Email: ${user.email}</li>
                    <li>Role: ${user.role}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('users:*');
        await deleteCache(`user:${user._id}`);

        logger.info('User updated:', user._id);
        res.json({
            success: true,
            data: user,
        });
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin/Manager)
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.',
            });
        }

        // Cek akses tenant
        if (user.tenant.toString() !== req.user.tenant.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk menghapus pengguna ini.',
            });
        }

        // Soft delete
        user.isActive = false;
        await user.save();

        // Kirim email notifikasi
        await sendEmail({
            email: user.email,
            subject: 'Akun Dinonaktifkan',
            html: `
                <h2>Akun Dinonaktifkan</h2>
                <p>Akun Anda telah dinonaktifkan. Berikut adalah detail:</p>
                <ul>
                    <li>Nama: ${user.name}</li>
                    <li>Email: ${user.email}</li>
                </ul>
                <p>Jika Anda memiliki pertanyaan, silakan hubungi tim support kami.</p>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('users:*');
        await deleteCache(`user:${user._id}`);

        logger.info('User deleted:', user._id);
        res.json({
            success: true,
            message: 'Pengguna berhasil dihapus.',
        });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin/Manager)
const getUserStats = async (req, res) => {
    try {
        const cacheKey = `user:stats:${req.user.tenant}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for user statistics');
            return res.json(cachedData);
        }

        const stats = await User.getUserStats(req.user.tenant);

        const response = {
            success: true,
            data: stats[0] || {
                totalUsers: 0,
                verifiedUsers: 0,
                roleDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting user statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

// @desc    Update user preferences
// @route   PATCH /api/users/:id/preferences
// @access  Private
const updateUserPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.',
            });
        }

        // Cek akses
        if (user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses untuk mengupdate preferensi pengguna ini.',
            });
        }

        // Update preferences
        user.preferences = {
            ...user.preferences,
            ...req.body
        };

        await user.save();

        // Hapus cache yang terkait
        await deleteCache(`user:${user._id}`);

        logger.info('User preferences updated:', user._id);
        res.json({
            success: true,
            data: user,
        });
    } catch (error) {
        logger.error('Error updating user preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Reset password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.',
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 menit

        await user.save();

        // Kirim email reset password
        await sendEmail({
            email: user.email,
            subject: 'Reset Password',
            html: `
                <h2>Reset Password</h2>
                <p>Anda telah meminta untuk mereset password Anda. Silakan klik link di bawah ini:</p>
                <a href="${process.env.FRONTEND_URL}/reset-password/${resetToken}">
                    Reset Password
                </a>
                <p>Link ini akan kadaluarsa dalam 10 menit.</p>
                <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
            `,
        });

        res.json({
            success: true,
            message: 'Email reset password telah dikirim.',
        });
    } catch (error) {
        logger.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

module.exports = {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getUserStats,
    updateUserPreferences,
    resetPassword
}; 