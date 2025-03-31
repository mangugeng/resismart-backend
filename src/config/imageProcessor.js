const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const processImage = async (file) => {
    try {
        const filename = path.parse(file.filename).name;
        const ext = path.parse(file.filename).ext;
        const outputPath = path.join('uploads', `${filename}-compressed${ext}`);

        // Kompresi gambar
        await sharp(file.path)
            .resize(800, 800, { // Resize maksimal 800x800
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 }) // Kompresi JPEG dengan kualitas 80%
            .toFile(outputPath);

        // Hapus file original
        fs.unlinkSync(file.path);

        return outputPath;
    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
};

module.exports = {
    processImage
}; 