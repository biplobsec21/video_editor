-- Create content_collection table
CREATE TABLE IF NOT EXISTS content_collection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tags JSON,
    category VARCHAR(50),
    thumbnail_path VARCHAR(255),
    video_path VARCHAR(255) NOT NULL,
    duration FLOAT,
    resolution JSON,
    hashtags JSON,
    trim_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_title (title),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add fulltext search index
ALTER TABLE content_collection
ADD FULLTEXT INDEX ft_content (title, description); 