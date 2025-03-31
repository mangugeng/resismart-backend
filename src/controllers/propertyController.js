const Property = require('../models/Property');
const { sendEmail } = require('../config/email');
const { processImage } = require('../config/imageProcessor');
const { getCache, setCache, deleteCache } = require('../config/cache');
const { logger } = require('../config/logger');

// @desc    Get all properties with filter, search, and pagination
// @route   GET /api/properties
// @access  Public
const getProperties = async (req, res) => {
    try {
        const { query, page, limit, sort, fields, ...filters } = req.query;
        const cacheKey = `properties:${JSON.stringify({ query, page, limit, sort, fields, ...filters })}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for properties list');
            return res.json(cachedData);
        }

        const result = await Property.findWithFilter(query, {
            page,
            limit,
            sort,
            fields,
            ...filters,
        });

        const response = {
            success: true,
            count: result.properties.length,
            pagination: result.pagination,
            data: result.properties,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting properties:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Get single property
// @route   GET /api/properties/:id
// @access  Public
const getProperty = async (req, res) => {
    try {
        const cacheKey = `property:${req.params.id}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for property details');
            return res.json(cachedData);
        }

        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Properti tidak ditemukan.',
            });
        }

        const response = {
            success: true,
            data: property,
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error getting property:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Create new property
// @route   POST /api/properties
// @access  Private (Admin & Property Manager)
const createProperty = async (req, res) => {
    try {
        // Proses gambar jika ada
        if (req.files && req.files.length > 0) {
            const processedImages = await Promise.all(
                req.files.map(async (file) => {
                    const processedPath = await processImage(file);
                    return {
                        url: processedPath,
                        caption: req.body.imageCaptions?.[file.filename] || '',
                    };
                })
            );
            req.body.images = processedImages;
        }

        const property = await Property.create(req.body);

        // Kirim email notifikasi
        await sendEmail({
            email: process.env.ADMIN_EMAIL,
            subject: 'Properti Baru Ditambahkan',
            html: `
                <h2>Properti Baru Ditambahkan</h2>
                <p>Properti "${property.name}" telah ditambahkan ke sistem.</p>
                <p>Detail:</p>
                <ul>
                    <li>Nama: ${property.name}</li>
                    <li>Alamat: ${property.address.street}, ${property.address.city}</li>
                    <li>Jumlah Unit: ${property.totalUnits}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('properties:*');

        logger.info('New property created:', property._id);
        res.status(201).json({
            success: true,
            data: property,
        });
    } catch (error) {
        logger.error('Error creating property:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Update property
// @route   PUT /api/properties/:id
// @access  Private (Admin & Property Manager)
const updateProperty = async (req, res) => {
    try {
        // Proses gambar baru jika ada
        if (req.files && req.files.length > 0) {
            const processedImages = await Promise.all(
                req.files.map(async (file) => {
                    const processedPath = await processImage(file);
                    return {
                        url: processedPath,
                        caption: req.body.imageCaptions?.[file.filename] || '',
                    };
                })
            );
            req.body.images = [...(req.body.images || []), ...processedImages];
        }

        const property = await Property.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Properti tidak ditemukan.',
            });
        }

        // Kirim email notifikasi
        await sendEmail({
            email: process.env.ADMIN_EMAIL,
            subject: 'Properti Diupdate',
            html: `
                <h2>Properti Diupdate</h2>
                <p>Properti "${property.name}" telah diupdate.</p>
                <p>Detail terbaru:</p>
                <ul>
                    <li>Nama: ${property.name}</li>
                    <li>Alamat: ${property.address.street}, ${property.address.city}</li>
                    <li>Jumlah Unit: ${property.totalUnits}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('properties:*');
        await deleteCache(`property:${property._id}`);

        logger.info('Property updated:', property._id);
        res.json({
            success: true,
            data: property,
        });
    } catch (error) {
        logger.error('Error updating property:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private (Admin)
const deleteProperty = async (req, res) => {
    try {
        const property = await Property.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Properti tidak ditemukan.',
            });
        }

        // Kirim email notifikasi
        await sendEmail({
            email: process.env.ADMIN_EMAIL,
            subject: 'Properti Dihapus',
            html: `
                <h2>Properti Dihapus</h2>
                <p>Properti "${property.name}" telah dihapus dari sistem.</p>
                <p>Detail:</p>
                <ul>
                    <li>Nama: ${property.name}</li>
                    <li>Alamat: ${property.address.street}, ${property.address.city}</li>
                    <li>Jumlah Unit: ${property.totalUnits}</li>
                </ul>
            `,
        });

        // Hapus cache yang terkait
        await deleteCache('properties:*');
        await deleteCache(`property:${property._id}`);

        logger.info('Property deleted:', property._id);
        res.json({
            success: true,
            message: 'Properti berhasil dihapus.',
        });
    } catch (error) {
        logger.error('Error deleting property:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message,
        });
    }
};

// @desc    Search properties with advanced filters
// @route   GET /api/properties/search
// @access  Public
const searchProperties = async (req, res) => {
    try {
        const {
            keyword,
            minPrice,
            maxPrice,
            propertyType,
            location,
            amenities,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const cacheKey = `search:${JSON.stringify(req.query)}`;

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for property search');
            return res.json(cachedData);
        }

        // Build query
        const query = { isActive: true };

        // Keyword search
        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } },
                { 'address.street': { $regex: keyword, $options: 'i' } }
            ];
        }

        // Price range
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        // Property type
        if (propertyType) {
            query.propertyType = propertyType;
        }

        // Location search
        if (location) {
            query['address.city'] = { $regex: location, $options: 'i' };
        }

        // Amenities
        if (amenities) {
            const amenitiesArray = amenities.split(',');
            query.amenities = { $all: amenitiesArray };
        }

        // Sort options
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query with pagination
        const properties = await Property.find(query)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('owner', 'name email');

        // Get total count for pagination
        const total = await Property.countDocuments(query);

        const response = {
            success: true,
            count: properties.length,
            total,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit)
            },
            data: properties
        };

        // Set cache
        await setCache(cacheKey, response, 300); // Cache selama 5 menit

        res.json(response);
    } catch (error) {
        logger.error('Error searching properties:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

// @desc    Get property statistics
// @route   GET /api/properties/stats
// @access  Private (Admin)
const getPropertyStats = async (req, res) => {
    try {
        const cacheKey = 'property:stats';

        // Cek cache
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            logger.info('Cache hit for property statistics');
            return res.json(cachedData);
        }

        const stats = await Property.aggregate([
            {
                $group: {
                    _id: null,
                    totalProperties: { $sum: 1 },
                    totalUnits: { $sum: '$totalUnits' },
                    averagePrice: { $avg: '$price' },
                    propertyTypes: {
                        $push: '$propertyType'
                    },
                    cities: {
                        $push: '$address.city'
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalProperties: 1,
                    totalUnits: 1,
                    averagePrice: 1,
                    propertyTypeDistribution: {
                        $reduce: {
                            input: '$propertyTypes',
                            initialValue: {},
                            in: {
                                $mergeObjects: [
                                    '$$value',
                                    { ['$$this']: { $add: [{ $indexOfArray: ['$propertyTypes', '$$this'] }, 1] } }
                                ]
                            }
                        }
                    },
                    cityDistribution: {
                        $reduce: {
                            input: '$cities',
                            initialValue: {},
                            in: {
                                $mergeObjects: [
                                    '$$value',
                                    { ['$$this']: { $add: [{ $indexOfArray: ['$cities', '$$this'] }, 1] } }
                                ]
                            }
                        }
                    }
                }
            }
        ]);

        const response = {
            success: true,
            data: stats[0] || {
                totalProperties: 0,
                totalUnits: 0,
                averagePrice: 0,
                propertyTypeDistribution: {},
                cityDistribution: {}
            }
        };

        // Set cache
        await setCache(cacheKey, response, 3600); // Cache selama 1 jam

        res.json(response);
    } catch (error) {
        logger.error('Error getting property statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server.',
            error: error.message
        });
    }
};

module.exports = {
    getProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
    searchProperties,
    getPropertyStats
}; 