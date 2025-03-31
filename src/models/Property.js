const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    address: {
        street: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        postalCode: {
            type: String,
            required: true
        },
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },
    totalUnits: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    propertyType: {
        type: String,
        enum: ['apartment', 'condo', 'house', 'land'],
        required: true
    },
    amenities: [{
        type: String,
        enum: ['parking', 'security', 'elevator', 'gym', 'pool', 'playground', 'garden']
    }],
    images: [{
        url: String,
        caption: String
    }],
    contactInfo: {
        phone: String,
        email: String,
        website: String
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index untuk optimasi query
propertySchema.index({ tenant: 1 });
propertySchema.index({ name: 1 });
propertySchema.index({ 'address.city': 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ isActive: 1 });

// Method untuk mendapatkan properti berdasarkan filter
propertySchema.statics.findWithFilter = async function (query, options = {}) {
    const {
        page = 1,
        limit = 10,
        sort = '-createdAt',
        fields,
        ...filters
    } = options;

    // Build query
    const queryObj = { ...filters };
    if (query) {
        queryObj.$or = [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { 'address.street': { $regex: query, $options: 'i' } }
        ];
    }

    // Select fields
    let selectFields = fields ? fields.split(',').join(' ') : '';

    // Execute query
    const properties = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenant', 'name code')
        .populate('owner', 'name email');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        properties,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik properti
propertySchema.statics.getPropertyStats = async function (tenantId) {
    return this.aggregate([
        {
            $match: {
                tenant: mongoose.Types.ObjectId(tenantId),
                isActive: true
            }
        },
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
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property; 