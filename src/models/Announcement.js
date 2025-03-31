const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['general', 'maintenance', 'event', 'emergency', 'other'],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    targetAudience: {
        type: String,
        enum: ['all', 'residents', 'staff', 'management'],
        default: 'all'
    },
    attachments: [{
        url: String,
        caption: String,
        uploadedAt: Date
    }],
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    schedule: {
        startDate: Date,
        endDate: Date,
        isRecurring: {
            type: Boolean,
            default: false
        },
        recurrence: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly']
        }
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    views: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        viewedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index untuk optimasi query
announcementSchema.index({ tenant: 1 });
announcementSchema.index({ property: 1 });
announcementSchema.index({ type: 1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ status: 1 });
announcementSchema.index({ 'schedule.startDate': 1 });
announcementSchema.index({ 'schedule.endDate': 1 });
announcementSchema.index({ createdAt: -1 });

// Method untuk mendapatkan pengumuman berdasarkan filter
announcementSchema.statics.findWithFilter = async function (query, options = {}) {
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
            { title: { $regex: query, $options: 'i' } },
            { content: { $regex: query, $options: 'i' } }
        ];
    }

    // Select fields
    let selectFields = fields ? fields.split(',').join(' ') : '';

    // Execute query
    const announcements = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenant', 'name code')
        .populate('property', 'name')
        .populate('author', 'name email')
        .populate('views.user', 'name email');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        announcements,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik pengumuman
announcementSchema.statics.getAnnouncementStats = async function (tenantId) {
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
                totalAnnouncements: { $sum: 1 },
                types: {
                    $push: '$type'
                },
                priorities: {
                    $push: '$priority'
                },
                statuses: {
                    $push: '$status'
                },
                totalViews: { $sum: { $size: '$views' } },
                uniqueViewers: { $addToSet: '$views.user' }
            }
        },
        {
            $project: {
                _id: 0,
                totalAnnouncements: 1,
                totalViews: 1,
                uniqueViewers: { $size: '$uniqueViewers' },
                typeDistribution: {
                    $reduce: {
                        input: '$types',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$types', '$$this'] }, 1] } }
                            ]
                        }
                    }
                },
                priorityDistribution: {
                    $reduce: {
                        input: '$priorities',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$priorities', '$$this'] }, 1] } }
                            ]
                        }
                    }
                },
                statusDistribution: {
                    $reduce: {
                        input: '$statuses',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$statuses', '$$this'] }, 1] } }
                            ]
                        }
                    }
                }
            }
        }
    ]);
};

const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = Announcement; 