# ResiSmart Backend Documentation

## Daftar Isi
- [ResiSmart Backend Documentation](#resismart-backend-documentation)
  - [Daftar Isi](#daftar-isi)
  - [Pendahuluan](#pendahuluan)
  - [Teknologi yang Digunakan](#teknologi-yang-digunakan)
  - [Struktur Proyek](#struktur-proyek)
  - [Instalasi](#instalasi)
  - [Konfigurasi](#konfigurasi)
  - [API Endpoints](#api-endpoints)
    - [Autentikasi](#autentikasi)
    - [Pengumuman (Announcements)](#pengumuman-announcements)
    - [Keluhan (Complaints)](#keluhan-complaints)
    - [Pembayaran (Payments)](#pembayaran-payments)
    - [Pemeliharaan (Maintenance)](#pemeliharaan-maintenance)
  - [Model Database](#model-database)
    - [User](#user)
    - [Tenant](#tenant)
    - [Property](#property)
    - [Unit](#unit)
    - [Announcement](#announcement)
    - [Complaint](#complaint)
    - [Payment](#payment)
    - [Maintenance](#maintenance)
  - [Middleware](#middleware)
    - [Auth Middleware](#auth-middleware)
    - [Validators](#validators)
  - [Keamanan](#keamanan)
  - [Caching](#caching)
  - [Email Notifikasi](#email-notifikasi)
  - [File Upload](#file-upload)
  - [Error Handling](#error-handling)
  - [Logging](#logging)
  - [Kontribusi](#kontribusi)
  - [Lisensi](#lisensi)

## Pendahuluan
ResiSmart adalah sistem manajemen properti yang membantu pengelola properti dalam mengelola berbagai aspek properti mereka, termasuk pengumuman, keluhan, pembayaran, dan pemeliharaan.

## Teknologi yang Digunakan
- Node.js
- Express.js
- MongoDB dengan Mongoose
- Redis untuk caching
- Multer untuk file upload
- JWT untuk autentikasi
- Nodemailer untuk email
- Winston untuk logging

## Struktur Proyek
```
resismart/backend/
├── src/
│   ├── config/
│   │   ├── cache.js
│   │   ├── email.js
│   │   ├── imageProcessor.js
│   │   └── logger.js
│   ├── controllers/
│   │   ├── announcementController.js
│   │   ├── complaintController.js
│   │   ├── maintenanceController.js
│   │   └── paymentController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validators.js
│   ├── models/
│   │   ├── Announcement.js
│   │   ├── Complaint.js
│   │   ├── Maintenance.js
│   │   └── Payment.js
│   ├── routes/
│   │   ├── announcementRoutes.js
│   │   ├── complaintRoutes.js
│   │   ├── maintenanceRoutes.js
│   │   └── paymentRoutes.js
│   └── app.js
├── uploads/
├── .env
├── .gitignore
└── package.json
```

## Instalasi
1. Clone repositori
```bash
git clone https://github.com/yourusername/resismart.git
cd resismart/backend
```

2. Install dependencies
```bash
npm install
```

3. Buat file .env
```bash
cp .env.example .env
```

4. Jalankan aplikasi
```bash
npm start
```

## Konfigurasi
File `.env` harus berisi konfigurasi berikut:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resismart
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_password
FRONTEND_URL=http://localhost:3000
```

## API Endpoints

### Autentikasi
- `POST /api/auth/register` - Registrasi pengguna baru
- `POST /api/auth/login` - Login pengguna
- `GET /api/auth/me` - Mendapatkan data pengguna yang sedang login

### Pengumuman (Announcements)
- `GET /api/announcements` - Mendapatkan semua pengumuman
- `GET /api/announcements/:id` - Mendapatkan detail pengumuman
- `POST /api/announcements` - Membuat pengumuman baru (Admin/Manager)
- `PUT /api/announcements/:id` - Mengupdate pengumuman (Admin/Manager)
- `DELETE /api/announcements/:id` - Menghapus pengumuman (Admin/Manager)
- `GET /api/announcements/stats` - Mendapatkan statistik pengumuman (Admin/Manager)

### Keluhan (Complaints)
- `GET /api/complaints` - Mendapatkan semua keluhan
- `GET /api/complaints/:id` - Mendapatkan detail keluhan
- `POST /api/complaints` - Membuat keluhan baru (Resident)
- `PATCH /api/complaints/:id/status` - Mengupdate status keluhan (Admin/Manager/Staff)
- `POST /api/complaints/:id/comments` - Menambahkan komentar
- `POST /api/complaints/:id/feedback` - Memberikan feedback (Resident)
- `GET /api/complaints/stats` - Mendapatkan statistik keluhan (Admin/Manager)

### Pembayaran (Payments)
- `GET /api/payments` - Mendapatkan semua pembayaran
- `GET /api/payments/:id` - Mendapatkan detail pembayaran
- `POST /api/payments` - Membuat pembayaran baru (Admin/Manager)
- `PATCH /api/payments/:id/status` - Mengupdate status pembayaran (Admin/Manager)
- `GET /api/payments/stats` - Mendapatkan statistik pembayaran (Admin/Manager)

### Pemeliharaan (Maintenance)
- `GET /api/maintenance` - Mendapatkan semua tugas pemeliharaan
- `GET /api/maintenance/:id` - Mendapatkan detail tugas pemeliharaan
- `POST /api/maintenance` - Membuat tugas pemeliharaan baru (Admin/Manager)
- `PATCH /api/maintenance/:id/status` - Mengupdate status pemeliharaan (Admin/Manager)
- `GET /api/maintenance/stats` - Mendapatkan statistik pemeliharaan (Admin/Manager)

## Model Database

### User
- `name`: String
- `email`: String (unique)
- `password`: String (hashed)
- `role`: Enum ['admin', 'manager', 'staff', 'resident']
- `tenant`: ObjectId (ref: Tenant)
- `isActive`: Boolean

### Tenant
- `name`: String
- `code`: String (unique)
- `address`: Object
- `contactInfo`: Object
- `isActive`: Boolean

### Property
- `name`: String
- `address`: Object
- `totalUnits`: Number
- `contactInfo`: Object
- `tenant`: ObjectId (ref: Tenant)
- `isActive`: Boolean

### Unit
- `number`: String
- `type`: String
- `floor`: Number
- `area`: Number
- `property`: ObjectId (ref: Property)
- `isActive`: Boolean

### Announcement
- `title`: String
- `content`: String
- `type`: Enum
- `priority`: Enum
- `targetAudience`: Enum
- `schedule`: Object
- `attachments`: Array
- `tenant`: ObjectId (ref: Tenant)
- `isActive`: Boolean

### Complaint
- `title`: String
- `description`: String
- `category`: Enum
- `priority`: Enum
- `status`: Enum
- `attachments`: Array
- `tenant`: ObjectId (ref: Tenant)
- `unit`: ObjectId (ref: Unit)
- `resident`: ObjectId (ref: User)
- `assignedTo`: ObjectId (ref: User)
- `comments`: Array
- `resolution`: Object
- `feedback`: Object
- `isActive`: Boolean

### Payment
- `type`: Enum
- `amount`: Number
- `currency`: String
- `status`: Enum
- `paymentMethod`: Enum
- `paymentDetails`: Object
- `dueDate`: Date
- `paidAt`: Date
- `attachments`: Array
- `tenant`: ObjectId (ref: Tenant)
- `unit`: ObjectId (ref: Unit)
- `resident`: ObjectId (ref: User)
- `isActive`: Boolean

### Maintenance
- `title`: String
- `description`: String
- `type`: Enum
- `priority`: Enum
- `status`: Enum
- `category`: Enum
- `schedule`: Object
- `assignedTo`: ObjectId (ref: User)
- `cost`: Object
- `attachments`: Array
- `notes`: String
- `completionNotes`: String
- `completedAt`: Date
- `completedBy`: ObjectId (ref: User)
- `tenant`: ObjectId (ref: Tenant)
- `property`: ObjectId (ref: Property)
- `unit`: ObjectId (ref: Unit)
- `isActive`: Boolean

## Middleware

### Auth Middleware
- `protect`: Memastikan pengguna terautentikasi
- `authorize`: Memastikan pengguna memiliki role yang sesuai

### Validators
- `validateProperty`: Validasi data properti
- `validateAnnouncement`: Validasi data pengumuman
- `validateComplaint`: Validasi data keluhan
- `validatePayment`: Validasi data pembayaran
- `validateMaintenance`: Validasi data pemeliharaan

## Keamanan
1. Autentikasi menggunakan JWT
2. Password di-hash menggunakan bcrypt
3. Rate limiting untuk mencegah brute force
4. Validasi input untuk mencegah injection
5. CORS untuk keamanan cross-origin
6. Sanitasi data untuk mencegah XSS

## Caching
1. Redis digunakan untuk caching
2. Cache untuk:
   - Daftar data (5 menit)
   - Detail data (5 menit)
   - Statistik (1 jam)
3. Cache dihapus saat data diupdate

## Email Notifikasi
1. Menggunakan Nodemailer
2. Notifikasi untuk:
   - Pengumuman baru
   - Status pengumuman diupdate
   - Keluhan baru
   - Status keluhan diupdate
   - Pembayaran baru
   - Status pembayaran diupdate
   - Tugas pemeliharaan baru
   - Status pemeliharaan diupdate

## File Upload
1. Menggunakan Multer
2. Konfigurasi:
   - Maksimal 5 file per upload
   - Maksimal 5MB per file
   - Format yang diizinkan: JPEG, PNG, PDF
3. File disimpan di folder `uploads/`
4. Gambar diproses untuk optimasi

## Error Handling
1. Error handling terpusat
2. Logging error ke file
3. Response error yang informatif
4. Validasi error yang terstruktur

## Logging
1. Menggunakan Winston
2. Log untuk:
   - Error
   - Info
   - Debug
3. Log disimpan ke file dan console
4. Format log yang terstruktur

## Kontribusi
1. Fork repositori
2. Buat branch fitur baru
3. Commit perubahan
4. Push ke branch
5. Buat Pull Request

## Lisensi
MIT License 