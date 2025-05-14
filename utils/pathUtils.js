const path = require('path');

// Convert absolute path to relative path (relative to public directory)
function toRelativePath(absolutePath) {
    if (!absolutePath) return null;

    // Remove any duplicate 'public' in the path
    const normalizedPath = absolutePath.replace(/public\/public/, 'public');

    // Find the 'public' directory in the path
    const publicIndex = normalizedPath.indexOf('public/');
    if (publicIndex === -1) return absolutePath;

    // Get the part of the path after 'public/'
    return normalizedPath.slice(publicIndex + 7); // 7 is the length of 'public/'
}

// Convert relative path to absolute path (relative to public directory)
function toAbsolutePath(relativePath) {
    if (!relativePath) return null;

    // Remove any leading '/' from the relative path
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

    // Join with the public directory path
    return path.join(__dirname, '..', 'public', cleanPath);
}

// Normalize a path by removing duplicate 'public' directories
function normalizePath(filePath) {
    if (!filePath) return null;
    return filePath.replace(/public\/+public/g, 'public');
}

module.exports = {
    toRelativePath,
    toAbsolutePath,
    normalizePath
};